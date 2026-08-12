import { truncate } from "../normalize.js"
import type { LiteratureProvider, ProviderPaper, SearchInput } from "../types.js"
import { applyCommonFilters, makePaper } from "./common.js"

const BASE = "https://api.openalex.org/works"

interface OpenAlexWork {
  id?: string
  doi?: string
  display_name?: string
  title?: string
  publication_year?: number
  abstract_inverted_index?: Record<string, number[]> | null
  authorships?: Array<{ author?: { display_name?: string } }>
  primary_location?: { landing_page_url?: string; pdf_url?: string; source?: { display_name?: string } }
  best_oa_location?: { landing_page_url?: string; pdf_url?: string; source?: { display_name?: string } }
  open_access?: { is_oa?: boolean; oa_url?: string }
}

interface OpenAlexResponse {
  results?: OpenAlexWork[]
}

export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string | undefined {
  if (!index) return undefined
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) if (Number.isInteger(position) && position >= 0) words[position] = word
  }
  return truncate(words.filter((word) => word !== undefined).join(" "))
}

export function parseOpenAlex(data: OpenAlexResponse): ProviderPaper[] {
  return (data.results ?? []).map((record) => {
    const id = record.id?.replace(/^https?:\/\/openalex\.org\//i, "") ?? ""
    const location = record.best_oa_location ?? record.primary_location
    return makePaper({
      source: "openalex",
      source_id: id,
      title: record.display_name ?? record.title,
      abstract: abstractFromInvertedIndex(record.abstract_inverted_index),
      identifiers: { doi: record.doi, openalex: id },
      url: location?.landing_page_url ?? record.id ?? record.open_access?.oa_url,
      pdf_url: record.best_oa_location?.pdf_url ?? (record.open_access?.is_oa ? record.primary_location?.pdf_url : undefined),
      year: record.publication_year,
      authors: record.authorships?.map((authorship) => authorship.author?.display_name),
      venue: location?.source?.display_name,
      open_access: record.open_access?.is_oa,
    })
  })
}

export const openalex: LiteratureProvider = {
  id: "openalex",
  name: "OpenAlex",
  description: "Open scholarly catalog with reconstructed abstracts and open-access locations.",
  homepage: "https://openalex.org/",

  async search(input, context) {
    const params = new URLSearchParams({ search: input.query, "per-page": String(input.limit) })
    const filters: string[] = []
    if (input.year_from !== undefined && input.year_to !== undefined) {
      filters.push(`publication_year:${input.year_from}-${input.year_to}`)
    } else if (input.year_from !== undefined) {
      filters.push(`from_publication_date:${input.year_from}-01-01`)
    } else if (input.year_to !== undefined) {
      filters.push(`to_publication_date:${input.year_to}-12-31`)
    }
    if (input.open_access) filters.push("is_oa:true")
    if (filters.length) params.set("filter", filters.join(","))
    const mailto = process.env.OPENALEX_MAILTO?.trim()
    const key = process.env.OPENALEX_API_KEY?.trim()
    if (mailto) params.set("mailto", mailto)
    if (key) params.set("api_key", key)
    const data = await context.http.getJson<OpenAlexResponse>(`${BASE}?${params}`, { signal: context.signal })
    return applyCommonFilters(parseOpenAlex(data), input).slice(0, input.limit)
  },
}
