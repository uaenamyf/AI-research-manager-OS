import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { HistoryStore } from "../src/history.js"
import type { SearchResponse } from "../src/types.js"

test("history stores metadata without abstracts, authors, or secrets and can be cleared", async () => {
  const directory = await mkdtemp(join(process.cwd(), ".test-history-"))
  const path = join(directory, "history.jsonl")
  const history = new HistoryStore({ path })
  const response: SearchResponse = {
    query: "secret-free query",
    parameters: { limit: 10, sources: ["pubmed"] },
    results: [
      {
        rank: 1,
        fused_score: 0.1,
        title: "Not persisted",
        abstract: "SENSITIVE ABSTRACT",
        authors: ["Sensitive Author"],
        identifiers: { doi: "10.1000/example" },
        url: "https://doi.org/10.1000/example",
        source_evidence: [{ source: "pubmed", rank: 1, source_id: "123" }],
      },
    ],
    source_statuses: [{ source: "pubmed", status: "ok", result_count: 1, duration_ms: 2 }],
    total_candidates: 1,
    returned: 1,
    all_sources_failed: false,
  }

  await history.append(response)
  const content = await readFile(path, "utf8")
  assert.match(content, /10\.1000\/example/)
  assert.match(content, /"rank":1/)
  assert.doesNotMatch(content, /SENSITIVE ABSTRACT/)
  assert.doesNotMatch(content, /Sensitive Author/)
  assert.doesNotMatch(content, /Not persisted/)

  await history.clear()
  await assert.rejects(readFile(path, "utf8"), /ENOENT/)
  await rm(directory, { recursive: true, force: true })
})
