// Phase 0 MCP server proof: a minimal stdio MCP server exposing a
// `literature_search` tool. Spawned by dsh's mcp-client as a child process
// (`transport: 'stdio'`). Phase 0 returns static results to prove the
// ResearchOS → dsh wiring; the real MySQL-backed search lands in the data spike.
// @module @researchos/dsh-research-mcp

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'research-literature',
  version: '0.1.0',
})

server.registerTool(
  'literature_search',
  {
    title: 'Literature Search',
    description:
      'Search the ResearchOS literature library (Phase 0 stub: returns static results; real MySQL query in data spike)',
    inputSchema: {
      query: z.string().describe('Search query'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
    },
  },
  async ({ query, limit }) => {
    const n = limit ?? 10
    // Phase 0 stub data — proves the tool reaches DSH's ctx.tools.
    const results = Array.from({ length: Math.min(n, 3) }, (_, i) => ({
      id: i + 1,
      title: `Phase 0 stub result for "${query}" (${i + 1})`,
      authors: 'ResearchOS P0',
      year: 2026,
    }))
    return {
      content: [{ type: 'text', text: JSON.stringify({ query, count: results.length, results }) }],
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
