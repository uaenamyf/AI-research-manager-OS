// Phase 2 literature MCP server: `literature_search` now queries the real
// ResearchOS MySQL `paper` table (spawned by dsh mcp-client as a stdio child).
// DB config via env (ResearchOS defaults; override per deployment):
//   RESEARCH_MYSQL_HOST / PORT / USER / PASSWORD / DATABASE
// @module @researchos/dsh-research-mcp

import mysql from 'mysql2/promise'
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

const server = new McpServer({
  name: 'research-literature',
  version: '0.2.0',
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
        content: [
          {
            type: 'text',
            text: JSON.stringify({ query, count: rows.length, results: rows }, null, 2),
          },
        ],
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
    inputSchema: {
      paperId: z.number().int().describe('Paper id'),
    },
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

const transport = new StdioServerTransport()
await server.connect(transport)
