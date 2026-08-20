#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import * as z from "zod/v4"
import { sourceCatalog } from "./providers/index.js"
import { LiteratureSearchService } from "./service.js"
import { SOURCE_ORDER } from "./types.js"
import type { LiteratureProvider } from "./types.js"

const sourceSchema = z.enum(SOURCE_ORDER)

export interface LiteratureServerOptions {
  service?: LiteratureSearchService
  providers?: LiteratureProvider[]
}

export function createLiteratureServer(options: LiteratureServerOptions = {}): McpServer {
  const service = options.service ?? new LiteratureSearchService({ providers: options.providers })
  const server = new McpServer({ name: "literature-search-mcp", version: "1.0.0" })

  server.registerTool(
    "literature_search",
    {
      title: "Search scholarly literature",
      description:
        "Search PubMed, Europe PMC, bioRxiv/medRxiv, Crossref, OpenAlex, Semantic Scholar, and arXiv. Sources fan out in parallel by default; results are normalized, deduplicated, and fused deterministically. Returns metadata and short abstracts only, never full text or citation graphs.",
      inputSchema: {
        query: z.string().min(1).describe("Literature query"),
        limit: z.number().int().min(1).max(50).default(10).describe("Maximum fused results to return"),
        sources: z.array(sourceSchema).min(1).optional().describe("Optional source subset; default is all sources"),
        year_from: z.number().int().min(1000).max(3000).optional(),
        year_to: z.number().int().min(1000).max(3000).optional(),
        open_access: z.boolean().optional().describe("When true, retain results with positive open-access or PDF evidence"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input, extra) => {
      if (input.year_from !== undefined && input.year_to !== undefined && input.year_from > input.year_to) {
        throw new Error("year_from must be less than or equal to year_to")
      }
      const response = await service.search(input, extra.signal)
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: { ...response },
      }
    },
  )

  server.registerTool(
    "literature_sources",
    {
      title: "List literature sources",
      description: "List the seven supported literature sources, optional credential environment variables, and provider limitations.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const sources = sourceCatalog(options.providers).map((source) => ({
        ...source,
        credentials: source.credentials.map((name) => ({ name, configured: Boolean(process.env[name]?.trim()) })),
      }))
      const response = { sources, default_source_order: SOURCE_ORDER, count: sources.length }
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      }
    },
  )

  return server
}

export async function main(): Promise<void> {
  const server = createLiteratureServer()
  await server.connect(new StdioServerTransport())
  console.error("literature-search-mcp running on stdio")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`literature-search-mcp failed: ${error instanceof Error ? error.message : "unknown error"}`)
    process.exitCode = 1
  })
}
