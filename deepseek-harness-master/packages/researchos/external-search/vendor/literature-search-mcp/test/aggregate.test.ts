import assert from "node:assert/strict"
import test from "node:test"
import { deduplicateAndFuse } from "../src/aggregate.js"
import type { ProviderPaper, SourceId } from "../src/types.js"

function paper(source: SourceId, sourceId: string, title: string, identifiers: ProviderPaper["identifiers"]): ProviderPaper {
  return { source, source_id: sourceId, title, identifiers }
}

test("dedup uses DOI first and reciprocal-rank fusion rewards multi-source evidence", () => {
  const results = deduplicateAndFuse(
    [
      {
        source: "pubmed",
        papers: [
          { ...paper("pubmed", "1", "Shared discovery", { doi: "10.1000/X", pmid: "1" }), abstract: "short" },
          paper("pubmed", "2", "PubMed only", { pmid: "2" }),
        ],
      },
      {
        source: "crossref",
        papers: [
          { ...paper("crossref", "10.1000/x", "Shared Discovery!", { doi: "https://doi.org/10.1000/x" }), abstract: "a longer abstract" },
        ],
      },
    ],
    10,
  )
  assert.equal(results.length, 2)
  assert.equal(results[0]?.identifiers.doi, "10.1000/x")
  assert.equal(results[0]?.source_evidence.length, 2)
  assert.equal(results[0]?.abstract, "a longer abstract")
  assert.ok((results[0]?.fused_score ?? 0) > (results[1]?.fused_score ?? 0))
})

test("versionless arXiv IDs deduplicate", () => {
  const results = deduplicateAndFuse(
    [
      { source: "arxiv", papers: [paper("arxiv", "2401.00001v1", "First title", { arxiv: "2401.00001v1" })] },
      {
        source: "semantic-scholar",
        papers: [paper("semantic-scholar", "s2", "Different title metadata", { arxiv: "ARXIV:2401.00001v3" })],
      },
    ],
    10,
  )
  assert.equal(results.length, 1)
  assert.equal(results[0]?.identifiers.arxiv, "2401.00001")
})

test("normalized-title fallback never merges conflicting strong identifiers", () => {
  const results = deduplicateAndFuse(
    [
      { source: "pubmed", papers: [paper("pubmed", "1", "Identical title", { doi: "10.1000/a" })] },
      { source: "crossref", papers: [paper("crossref", "b", "Identical Title", { doi: "10.1000/b" })] },
    ],
    10,
  )
  assert.equal(results.length, 2)
  assert.deepEqual(
    results.map((result) => result.identifiers.doi),
    ["10.1000/a", "10.1000/b"],
  )
})

test("fixed source order provides stable tie-breaking", () => {
  const results = deduplicateAndFuse(
    [
      { source: "pubmed", papers: [paper("pubmed", "1", "Zulu", { pmid: "1" })] },
      { source: "arxiv", papers: [paper("arxiv", "2401.00002", "Alpha", { arxiv: "2401.00002" })] },
    ],
    10,
  )
  assert.equal(results[0]?.source_evidence[0]?.source, "pubmed")
  assert.equal(results[1]?.source_evidence[0]?.source, "arxiv")
})

test("strong identifier bridges merge transitively across DOI and PMID", () => {
  const results = deduplicateAndFuse(
    [
      { source: "pubmed", papers: [paper("pubmed", "p1", "Title A", { doi: "10.1000/bridge" })] },
      {
        source: "europepmc",
        papers: [paper("europepmc", "e1", "Title B", { doi: "10.1000/bridge", pmid: "999" })],
      },
      { source: "crossref", papers: [paper("crossref", "c1", "Title C", { pmid: "999" })] },
    ],
    10,
  )
  assert.equal(results.length, 1)
  assert.equal(results[0]?.source_evidence.length, 3)
})

test("duplicate records from one source receive only one RRF contribution", () => {
  const results = deduplicateAndFuse(
    [
      {
        source: "crossref",
        papers: [
          paper("crossref", "a", "Duplicate A", { doi: "10.1000/duplicate" }),
          paper("crossref", "b", "Duplicate B", { doi: "10.1000/duplicate" }),
        ],
      },
    ],
    10,
  )
  assert.equal(results.length, 1)
  assert.equal(results[0]?.fused_score, Number((1 / 61).toFixed(8)))
})

test("missing or placeholder titles do not participate in title fallback", () => {
  const results = deduplicateAndFuse(
    [
      {
        source: "pubmed",
        papers: [{ ...paper("pubmed", "missing-a", "Untitled", {}), title_missing: true }],
      },
      {
        source: "crossref",
        papers: [{ ...paper("crossref", "missing-b", "Untitled", {}), title_missing: true }],
      },
    ],
    10,
  )
  assert.equal(results.length, 2)
})
