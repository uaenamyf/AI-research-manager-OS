import { firstString, yearFrom } from "../normalize.js"
import type { LiteratureProvider, ProviderPaper, SearchInput } from "../types.js"
import { applyCommonFilters, makePaper } from "./common.js"

const BASE = "https://api.crossref.org/works"

interface CrossrefWork {
  DOI?: string
  title?: string[]
  subtitle?: string[]
  abstract?: string
  author?: Array<{ given?: string; family?: string; name?: string }>
  "container-title"?: string[]
  URL?: string
  issued?: { "date-parts"?: number[][] }
  published?: { "date-parts"?: number[][] }
  link?: Array<{ URL?: string; "content-type"?: string }>
  license?: Array<{ URL?: string }>
  resource?: { primary?: { URL?: string } }
}

interface CrossrefResponse {
  message?: { items?: CrossrefWork[] }
}

function dateYear(record: CrossrefWork): number | undefined {
  return record.issued?.["date-parts"]?.[0]?.[0] ?? record.published?.["date-parts"]?.[0]?.[0] ?? yearFrom(record)
}

function isOpenLicense(url: string | undefined): boolean {
  return Boolean(url && /creativecommons\.org|openaccess|opensource/i.test(url))
}

export function parseCrossref(data: CrossrefResponse): ProviderPaper[] {
  return (data.message?.items ?? []).map((record) => {
    const pdf = record.link?.find((link) => link["content-type"]?.toLowerCase() === "application/pdf")?.URL
    const open = Boolean(pdf) || record.license?.some((license) => isOpenLicense(license.URL)) === true
    const title = [firstString(record.title), firstString(record.subtitle)].filter(Boolean).join(": ")
    return makePaper({
      source: "crossref",
      source_id: record.DOI ?? record.URL ?? "",
      title,
      abstract: record.abstract,
      identifiers: { doi: record.DOI },
      url: record.URL ?? record.resource?.primary?.URL,
      pdf_url: pdf,
      year: dateYear(record),
      authors: record.author?.map((author) => author.name ?? [author.given, author.family].filter(Boolean).join(" ")),
      venue: firstString(record["container-title"]),
      open_access: open || undefined,
    })
  })
}

export const crossref: LiteratureProvider = {
  id: "crossref",
  name: "Crossref",
  description: "Cross-publisher DOI metadata, abstracts, authors, venues, and links.",
  homepage: "https://www.crossref.org/",

  async search(input, context) {
    const params = new URLSearchParams({
      query: input.query,
      rows: String(input.limit),
      select: "DOI,title,subtitle,abstract,author,container-title,URL,issued,published,link,license,resource",
    })
    const filters: string[] = []
    if (input.year_from !== undefined) filters.push(`from-pub-date:${input.year_from}-01-01`)
    if (input.year_to !== undefined) filters.push(`until-pub-date:${input.year_to}-12-31`)
    if (filters.length) params.set("filter", filters.join(","))
    const mailto = process.env.CROSSREF_MAILTO?.trim()
    if (mailto) params.set("mailto", mailto)
    const data = await context.http.getJson<CrossrefResponse>(`${BASE}?${params}`, { signal: context.signal })
    return applyCommonFilters(parseCrossref(data), input).slice(0, input.limit)
  },
}
