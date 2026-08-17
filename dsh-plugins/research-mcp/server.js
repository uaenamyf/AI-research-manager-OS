// Phase 2 literature MCP server: literature_search / literature_get / literature_cite
// over the real ResearchOS MySQL `paper` table, plus literature_vector_search over
// PostgreSQL `paper_chunk` with embeddings from the unified LLM gateway (requirement 2+3).
// Spawned by dsh mcp-client as a stdio child process.
//
// Env:
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos)
//   RESEARCH_PG_URL          (default postgresql://researchos:researchos@127.0.0.1:5432/researchos)
//   RESEARCH_GATEWAY_URL     (unified LLM/Embedding gateway, default http://127.0.0.1:3080)
//   RESEARCH_EMBED_MODEL     (default doubao-embedding-vision)
// @module @researchos/dsh-research-mcp

import mysql from 'mysql2/promise'
import pg from 'pg'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const DB = {
  host: process.env.RESEARCH_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.RESEARCH_MYSQL_PORT || 3306),
  user: process.env.RESEARCH_MYSQL_USER || 'researchos',
  password: process.env.RESEARCH_MYSQL_PASSWORD || 'researchos',
  database: process.env.RESEARCH_MYSQL_DATABASE || 'researchos',
}
const PG_URL = process.env.RESEARCH_PG_URL || 'postgresql://researchos:researchos@127.0.0.1:5432/researchos'
const GATEWAY = (process.env.RESEARCH_GATEWAY_URL || 'http://127.0.0.1:3080').replace(/\/$/, '')
const EMBED_MODEL = process.env.RESEARCH_EMBED_MODEL || 'doubao-embedding-vision'

/** Embed a text via the unified gateway /v1/embeddings. */
async function embed(text) {
  const res = await fetch(`${GATEWAY}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: text, model: EMBED_MODEL }),
  })
  if (!res.ok) throw new Error(`gateway embeddings HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.data?.[0]?.embedding
}

const server = new McpServer({
  name: 'research-literature',
  version: '0.3.0',
})

server.registerTool(
  'literature_search',
  {
    title: 'Literature Search',
    description:
      'Search the ResearchOS literature library (MySQL paper table: title/authors/doi fuzzy match). Returns paper id, title, authors, year, doi, status.',
    inputSchema: {
      query: z.string().describe('Search query'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
    },
  },
  async ({ query, limit }) => {
    const n = limit ?? 10
    const conn = await mysql.createConnection(DB)
    try {
      const like = `%${query}%`
      const [rows] = await conn.query(
        `SELECT id, title, authors, year, doi, status FROM paper
         WHERE title LIKE ? OR authors LIKE ? OR doi LIKE ?
         ORDER BY created_time DESC LIMIT ?`,
        [like, like, like, n],
      )
      return {
        content: [{ type: 'text', text: JSON.stringify({ query, count: rows.length, results: rows }, null, 2) }],
      }
    } finally {
      await conn.end()
    }
  },
)

server.registerTool(
  'literature_get',
  {
    title: 'Literature Get',
    description:
      'Get one ResearchOS paper by id (metadata + summary JSON). Returns paper id, title, authors, year, doi, status, summary.',
    inputSchema: { paperId: z.number().int().describe('Paper id') },
  },
  async ({ paperId }) => {
    const conn = await mysql.createConnection(DB)
    try {
      const [rows] = await conn.query(
        'SELECT id, title, authors, year, doi, status, summary FROM paper WHERE id = ? LIMIT 1',
        [paperId],
      )
      const paper = rows[0] ?? null
      return {
        content: [{ type: 'text', text: JSON.stringify(paper ?? { error: 'paper not found' }, null, 2) }],
      }
    } finally {
      await conn.end()
    }
  },
)

server.registerTool(
  'literature_cite',
  {
    title: 'Literature Cite',
    description:
      'Generate citations for ResearchOS papers by id (format: bibtex | ris). Fetches real metadata from MySQL.',
    inputSchema: {
      paperIds: z.array(z.number().int()).describe('Paper ids to cite'),
      format: z.enum(['bibtex', 'ris']).optional().describe('Citation format (default bibtex)'),
    },
  },
  async ({ paperIds, format }) => {
    const fmt = format ?? 'bibtex'
    const conn = await mysql.createConnection(DB)
    try {
      const ids = paperIds.filter(Number.isFinite)
      if (ids.length === 0) return { content: [{ type: 'text', text: 'no paperIds given' }] }
      const [rows] = await conn.query(
        `SELECT id, title, authors, year, doi FROM paper WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
      )
      let out
      if (fmt === 'ris') {
        out = rows
          .map((p) => {
            const lines = ['TY  - JOUR', `TI  - ${p.title ?? ''}`]
            for (const a of (p.authors ?? '').split(',').map((s) => s.trim()).filter(Boolean)) lines.push(`AU  - ${a}`)
            if (p.year) lines.push(`PY  - ${p.year}`)
            if (p.doi) lines.push(`DO  - ${p.doi}`)
            lines.push('ER  -')
            return lines.join('\n')
          })
          .join('\n\n')
      } else {
        out = rows
          .map((p) => {
            const key = (p.authors ?? 'anonymous').split(',')[0].trim().replace(/\s+/g, '') + (p.year ?? '')
            const author = (p.authors ?? '').replace(/&/g, '\\&')
            return `@article{${key},\n  title   = {${p.title ?? ''}},\n  author  = {${author}},\n  year    = {${p.year ?? ''}},${p.doi ? `\n  doi     = {${p.doi}},` : ''}\n}`
          })
          .join('\n\n')
      }
      return { content: [{ type: 'text', text: out }] }
    } finally {
      await conn.end()
    }
  },
)

server.registerTool(
  'literature_vector_search',
  {
    title: 'Literature Semantic Search',
    description:
      'Semantic search over ResearchOS paper chunks (PG paper_chunk) using the unified embedding gateway. Returns paper_id, section, content and cosine distance.',
    inputSchema: {
      query: z.string().describe('Natural-language query'),
      limit: z.number().int().min(1).max(20).optional().describe('Max chunks (default 5)'),
      paperId: z.number().int().optional().describe('Restrict to one paper'),
    },
  },
  async ({ query, limit, paperId }) => {
    const k = limit ?? 5
    let vec
    try {
      vec = await embed(query)
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `embedding via gateway failed: ${e.message}` }) }] }
    }
    const vecSql = `[${vec.join(',')}]`
    const pgc = new pg.Client({ connectionString: PG_URL })
    await pgc.connect()
    try {
      const params = [vecSql, k]
      let where = ''
      if (paperId) {
        where = 'WHERE paper_id = $3'
        params.push(paperId)
      }
      const q = `SELECT paper_id, section, left(content, 400) AS content, (embedding <-> $1::vector) AS dist
                 FROM paper_chunk ${where}
                 ORDER BY embedding <-> $1::vector LIMIT $2`
      const r = await pgc.query(q, params)
      return { content: [{ type: 'text', text: JSON.stringify({ query, count: r.rows.length, results: r.rows }, null, 2) }] }
    } finally {
      await pgc.end()
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
