import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { HistoryStore } from "../src/history.js"
import { HttpRequestError } from "../src/http.js"
import { LiteratureSearchService } from "../src/service.js"
import type { LiteratureProvider } from "../src/types.js"

function provider(id: LiteratureProvider["id"], behavior: LiteratureProvider["search"]): LiteratureProvider {
  return { id, name: id, description: id, homepage: `https://${id}.test`, search: behavior }
}

async function withHistory<T>(run: (history: HistoryStore) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(process.cwd(), ".test-service-"))
  try {
    return await run(new HistoryStore({ path: join(directory, "history.jsonl") }))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("search service preserves fixed source order, partial failures, and common filters", async () => {
  await withHistory(async (history) => {
    const service = new LiteratureSearchService({
      history,
      providers: [
        provider("crossref", async () => {
          throw new Error("provider token=must-not-leak")
        }),
        provider("pubmed", async () => [
          {
            source: "pubmed",
            source_id: "1",
            title: "Open paper",
            abstract: "Short abstract",
            identifiers: { pmid: "1" },
            year: 2024,
            pdf_url: "https://example.test/paper.pdf",
            open_access: true,
          },
          {
            source: "pubmed",
            source_id: "2",
            title: "Closed paper",
            identifiers: { pmid: "2" },
            year: 2024,
            open_access: false,
          },
        ]),
      ],
    })
    const response = await service.search({
      query: "cells",
      limit: 10,
      sources: ["crossref", "pubmed"],
      year_from: 2024,
      open_access: true,
    })
    assert.deepEqual(
      response.source_statuses.map((status) => status.source),
      ["pubmed", "crossref"],
    )
    assert.equal(response.source_statuses[0]?.status, "ok")
    assert.equal(response.source_statuses[0]?.result_count, 1)
    assert.equal(response.source_statuses[1]?.status, "error")
    assert.equal(response.results.length, 1)
    assert.equal(response.all_sources_failed, false)
  })
})

test("all provider failures return a structured normal response", async () => {
  await withHistory(async (history) => {
    const service = new LiteratureSearchService({
      history,
      providers: [
        provider("pubmed", async () => {
          throw new Error("down")
        }),
        provider("arxiv", async () => {
          throw new Error("also down")
        }),
      ],
    })
    const response = await service.search({ query: "anything", limit: 5 })
    assert.equal(response.all_sources_failed, true)
    assert.deepEqual(response.results, [])
    assert.equal(response.source_statuses.length, 2)
    assert.ok(response.source_statuses.every((status) => status.status === "error"))
  })
})

test("caller abort is not converted into a source failure", async () => {
  await withHistory(async (history) => {
    const controller = new AbortController()
    const service = new LiteratureSearchService({
      history,
      providers: [
        provider("pubmed", async (_input, context) => {
          controller.abort()
          throw context.signal?.reason ?? new DOMException("aborted", "AbortError")
        }),
      ],
    })
    await assert.rejects(service.search({ query: "cancel" }, controller.signal))
  })
})

test("source statuses classify empty, rate-limited, timeout, and recoverable warnings", async () => {
  await withHistory(async (history) => {
    const service = new LiteratureSearchService({
      history,
      providers: [
        provider("pubmed", async (_input, context) => {
          context.warnings?.push("partial sub-backend")
          return []
        }),
        provider("crossref", async () => {
          throw new HttpRequestError("HTTP 429 from provider", { kind: "http", status: 429, retryable: true })
        }),
        provider("arxiv", async () => {
          throw new HttpRequestError("timed out", { kind: "timeout", retryable: true })
        }),
      ],
    })
    const response = await service.search({ query: "status" })
    assert.deepEqual(
      response.source_statuses.map((status) => status.status),
      ["empty", "rate_limited", "timeout"],
    )
    assert.deepEqual(response.source_statuses[0]?.warnings, ["partial sub-backend"])
    assert.equal(response.all_sources_failed, false)
  })
})
