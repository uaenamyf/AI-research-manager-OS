import { normalizeArxiv, normalizePmid } from "../normalize.js"
import type { LiteratureProvider, ProviderPaper } from "../types.js"
import { applyCommonFilters, makePaper } from "./common.js"

const BASE = "https://api.semanticscholar.org/graph/v1/paper/search"
const FIELDS = "paperId,title,abstract,url,year,venue,authors,externalIds,openAccessPdf"

interface SemanticPaper {
  paperId?: string
  title?: string
  abstract?: string
  url?: string
  year?: number
  venue?: string
  authors?: Array<{ name?: string }>
  externalIds?: Record<string, string | number | null>
  openAccessPdf?: { url?: string; status?: string } | null
}

interface SemanticResponse {
  data?: SemanticPaper[]
}

function external(record: SemanticPaper, name: string): string | undefined {
  const entry = Object.entries(record.externalIds ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return entry?.[1] === undefined || entry[1] === null ? undefined : String(entry[1])
}

export function parseSemanticScholar(data: SemanticResponse): ProviderPaper[] {
  return (data.data ?? []).map((record) => {
    const pdf = record.openAccessPdf?.url
    return makePaper({
      source: "semantic-scholar",
      source_id: record.paperId ?? "",
      title: record.title,
      abstract: record.abstract,
      identifiers: {
        doi: external(record, "DOI"),
        pmid: normalizePmid(external(record, "PubMed")),
        arxiv: normalizeArxiv(external(record, "ArXiv")),
        semantic_scholar: record.paperId,
      },
      url: record.url ?? (record.paperId ? `https://www.semanticscholar.org/paper/${record.paperId}` : undefined),
      pdf_url: pdf,
      year: record.year,
      authors: record.authors?.map((author) => author.name),
      venue: record.venue,
      open_access: Boolean(pdf) || undefined,
    })
  })
}

export const semanticScholar: LiteratureProvider = {
  id: "semantic-scholar",
  name: "Semantic Scholar",
  description: "Academic Graph search with abstracts, external identifiers, and open-access PDF links.",
  homepage: "https://www.semanticscholar.org/",

  async search(input, context) {
    const params = new URLSearchParams({ query: input.query, limit: String(input.limit), fields: FIELDS })
    if (input.year_from !== undefined || input.year_to !== undefined) {
      params.set("year", `${input.year_from ?? ""}-${input.year_to ?? ""}`)
    }
    const key = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim()
    const headers = key ? { "x-api-key": key } : undefined
    const data = await context.http.getJson<SemanticResponse>(`${BASE}?${params}`, {
      signal: context.signal,
      headers,
      rateLimit: { minIntervalMs: key ? 100 : 1_000, maxConcurrent: key ? 2 : 1 },
    })
    return applyCommonFilters(parseSemanticScholar(data), input).slice(0, input.limit)
  },
}
