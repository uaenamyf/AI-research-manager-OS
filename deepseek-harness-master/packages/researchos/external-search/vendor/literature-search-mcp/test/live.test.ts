import assert from "node:assert/strict"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { HistoryStore } from "../src/history.js"
import { crossref } from "../src/providers/crossref.js"
import { LiteratureSearchService } from "../src/service.js"

const enabled = process.env.LITERATURE_SEARCH_LIVE === "1"

test("live Crossref smoke search", { skip: !enabled }, async () => {
  const historyPath = join(process.cwd(), ".test-live-history.jsonl")
  try {
    const service = new LiteratureSearchService({
      providers: [crossref],
      history: new HistoryStore({ path: historyPath }),
    })
    const response = await service.search({ query: "CRISPR", limit: 1, sources: ["crossref"] })
    assert.equal(response.source_statuses[0]?.status, "ok")
    assert.ok(response.results.length <= 1)
  } finally {
    await rm(historyPath, { force: true })
  }
})
