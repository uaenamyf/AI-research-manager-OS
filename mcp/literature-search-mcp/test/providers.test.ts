import assert from "node:assert/strict"
import test from "node:test"
import { HttpClient } from "../src/http.js"
import { parseArxivXml, arxiv } from "../src/providers/arxiv.js"
import { biorxiv, parseBiorxiv } from "../src/providers/biorxiv.js"
import { parseCrossref } from "../src/providers/crossref.js"
import { makePaper } from "../src/providers/common.js"
import { parseEuropePmc } from "../src/providers/europepmc.js"
import { openalex, parseOpenAlex } from "../src/providers/openalex.js"
import { parsePubmedXml, pubmed } from "../src/providers/pubmed.js"
import { parseSemanticScholar } from "../src/providers/semantic-scholar.js"
import {
  arxivXml,
  biorxivJson,
  crossrefJson,
  europePmcJson,
  openAlexJson,
  pubmedXml,
  semanticScholarJson,
} from "./fixtures.js"

test("missing provider titles get source-specific non-deduplicating display labels", () => {
  const paper = makePaper({ source: "pubmed", source_id: "123", title: undefined })
  assert.equal(paper.title, "pubmed record 123")
  assert.equal(paper.title_missing, true)
})

test("PubMed XML parser normalizes identifiers and metadata", () => {
  const [paper] = parsePubmedXml(pubmedXml)
  assert.ok(paper)
  assert.equal(paper.identifiers.pmid, "12345")
  assert.equal(paper.identifiers.doi, "10.1000/example")
  assert.equal(paper.identifiers.pmcid, "PMC999")
  assert.equal(paper.year, 2024)
  assert.deepEqual(paper.authors, ["Ada Lovelace"])
  assert.match(paper.title, /Example/)
  assert.match(paper.title, /biomedical/)
  assert.match(paper.title, /discovery/)
  assert.match(paper.abstract ?? "", /useful abstract/)
})

test("Europe PMC parser recognizes nested journal and open PDF", () => {
  const [paper] = parseEuropePmc(europePmcJson)
  assert.ok(paper)
  assert.equal(paper.venue, "Journal of Examples")
  assert.equal(paper.open_access, true)
  assert.match(paper.pdf_url ?? "", /PMC999/)
})

test("bioRxiv parser creates versioned landing and PDF URLs", () => {
  const [paper] = parseBiorxiv(biorxivJson, "biorxiv")
  assert.ok(paper)
  assert.equal(paper.identifiers.doi, "10.1101/2024.01.02.123456")
  assert.match(paper.url ?? "", /v2$/)
  assert.match(paper.pdf_url ?? "", /full\.pdf$/)
  assert.equal(paper.open_access, true)
})

test("Crossref parser strips JATS and detects open licenses", () => {
  const [paper] = parseCrossref(crossrefJson)
  assert.ok(paper)
  assert.equal(paper.abstract, "Crossref abstract.")
  assert.equal(paper.open_access, true)
  assert.equal(paper.pdf_url, "https://example.test/paper.pdf")
})

test("OpenAlex parser reconstructs inverted abstracts", () => {
  const [paper] = parseOpenAlex(openAlexJson)
  assert.ok(paper)
  assert.equal(paper.source_id, "W123")
  assert.equal(paper.abstract, "Example abstract text")
  assert.equal(paper.identifiers.doi, "10.1000/example")
})

test("Semantic Scholar parser maps external identifiers", () => {
  const [paper] = parseSemanticScholar(semanticScholarJson)
  assert.ok(paper)
  assert.equal(paper.identifiers.semantic_scholar, "S2-123")
  assert.equal(paper.identifiers.pmid, "12345")
  assert.equal(paper.identifiers.arxiv, "2401.01234")
  assert.equal(paper.open_access, true)
})

test("arXiv Atom parser removes versions and finds self-closing PDF links", () => {
  const [paper] = parseArxivXml(arxivXml)
  assert.ok(paper)
  assert.equal(paper.identifiers.arxiv, "2401.01234")
  assert.equal(paper.identifiers.doi, "10.1000/arxiv-example")
  assert.equal(paper.pdf_url, "https://arxiv.org/pdf/2401.01234v2")
  assert.equal(paper.venue, "cs.LG")
})

test("arXiv provider uses fake fetch and applies year filtering", async () => {
  const seen: string[] = []
  const http = new HttpClient({
    fetch: async (input) => {
      seen.push(String(input))
      return new Response(arxivXml, { status: 200, headers: { "content-type": "application/atom+xml" } })
    },
  })
  const papers = await arxiv.search(
    { query: "machine learning", limit: 5, year_from: 2024, year_to: 2024 },
    { http },
  )
  assert.equal(papers.length, 1)
  assert.match(seen[0] ?? "", /submittedDate/)
})

test("arXiv HTTP-200 error feeds throw instead of becoming empty success", () => {
  const errorFeed = `<?xml version="1.0"?><feed><entry><id>http://arxiv.org/api/errors</id><title>Error</title><summary>bad query</summary></entry></feed>`
  assert.throws(() => parseArxivXml(errorFeed), /arXiv rejected/)
})

test("PubMed open-access subset retains free-full-text hits without a PMCID", async () => {
  const withoutPmc = pubmedXml.replace(/\s*<ArticleId IdType="pmc">PMC999<\/ArticleId>/, "")
  const seen: string[] = []
  let clock = 0
  const http = new HttpClient({
    now: () => (clock += 1_000),
    fetch: async (input) => {
      const url = String(input)
      seen.push(url)
      if (url.includes("esearch.fcgi")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: ["12345"] } }))
      }
      return new Response(withoutPmc)
    },
  })
  const papers = await pubmed.search({ query: "cells", limit: 5, open_access: true }, { http })
  assert.equal(papers.length, 1)
  assert.equal(papers[0]?.open_access, true)
  assert.equal(papers[0]?.identifiers.pmcid, undefined)
  assert.match(new URL(seen[0] ?? "https://invalid.test").searchParams.get("term") ?? "", /free full text\[sb\]/)
})

test("Crossref accepts direct PDF evidence without a recognized license", () => {
  const [paper] = parseCrossref({
    message: {
      items: [
        {
          DOI: "10.1000/pdf-only",
          title: ["PDF-only access evidence"],
          link: [{ URL: "https://example.test/direct.pdf", "content-type": "application/pdf" }],
        },
      ],
    },
  })
  assert.ok(paper)
  assert.equal(paper.open_access, true)
  assert.equal(paper.pdf_url, "https://example.test/direct.pdf")
})

test("OpenAlex sends the current is_oa filter syntax", async () => {
  let seen = ""
  const http = new HttpClient({
    fetch: async (input) => {
      seen = String(input)
      return new Response(JSON.stringify({ results: [] }))
    },
  })
  await openalex.search({ query: "cells", limit: 5, open_access: true }, { http })
  assert.equal(new URL(seen).searchParams.get("filter"), "is_oa:true")
})

test("bioRxiv paginates recent pools and reports a failed sibling backend", async () => {
  const seen: string[] = []
  const records = Array.from({ length: 30 }, (_, index) => ({
    doi: `10.1101/2024.01.02.${String(index).padStart(6, "0")}`,
    title: `fixture preprint ${index}`,
    date: "2024-01-02",
    version: "1",
    server: "biorxiv",
  }))
  const http = new HttpClient({
    retries: 0,
    fetch: async (input) => {
      const url = String(input)
      seen.push(url)
      if (url.includes("/medrxiv/")) return new Response("down", { status: 503 })
      if (url.endsWith("/0")) {
        return new Response(JSON.stringify({ messages: [{ total: 31, count: 30 }], collection: records }))
      }
      return new Response(
        JSON.stringify({
          messages: [{ total: 31, count: 1 }],
          collection: [{ ...records[0], doi: "10.1101/2024.01.02.999999", title: "fixture final page" }],
        }),
      )
    },
  })
  const warnings: string[] = []
  const papers = await biorxiv.search({ query: "fixture", limit: 50 }, { http, warnings })
  assert.equal(papers.length, 31)
  assert.ok(seen.some((url) => url.endsWith("/biorxiv/200/30")))
  assert.ok(warnings.some((warning) => warning.includes("medrxiv backend failed")))
})
