import assert from "node:assert/strict"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createLiteratureServer } from "../src/server.js"
import type { LiteratureProvider } from "../src/types.js"

test("MCP server registers exactly the two required tools", async () => {
  const provider: LiteratureProvider = {
    id: "pubmed",
    name: "PubMed",
    description: "Fixture provider",
    homepage: "https://pubmed.ncbi.nlm.nih.gov/",
    search: async () => [],
  }
  const server = createLiteratureServer({ providers: [provider] })
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const tools = await client.listTools()
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["literature_search", "literature_sources"],
    )
    const searchTool = tools.tools.find((tool) => tool.name === "literature_search")
    assert.deepEqual(searchTool?.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    })
    const sources = await client.callTool({ name: "literature_sources", arguments: {} })
    assert.equal(sources.isError, undefined)
    assert.equal((sources.structuredContent as { count?: number } | undefined)?.count, 1)
  } finally {
    await client.close()
    await server.close()
  }
})
