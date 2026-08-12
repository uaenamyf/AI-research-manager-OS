import { cleanText, normalizeIdentifiers, truncate } from "../normalize.js"
import type { ProviderPaper, SearchInput, SourceId } from "../types.js"

export function makePaper(input: Omit<ProviderPaper, "identifiers" | "abstract" | "authors" | "venue" | "title"> & {
  title: unknown
  abstract?: unknown
  authors?: unknown[]
  venue?: unknown
  identifiers?: ProviderPaper["identifiers"]
}): ProviderPaper {
  const title = truncate(input.title, 500)
  return {
    source: input.source,
    source_id: input.source_id,
    title: title ?? `${input.source} record ${input.source_id || "without identifier"}`,
    title_missing: !title,
    abstract: truncate(input.abstract),
    identifiers: normalizeIdentifiers(input.identifiers ?? {}),
    url: cleanText(input.url),
    pdf_url: cleanText(input.pdf_url),
    year: input.year,
    authors: input.authors?.map(cleanText).filter((value): value is string => Boolean(value)),
    venue: cleanText(input.venue),
    open_access: input.open_access,
  }
}

export function applyCommonFilters(papers: ProviderPaper[], input: SearchInput): ProviderPaper[] {
  return papers.filter((paper) => {
    if (input.year_from !== undefined && (paper.year === undefined || paper.year < input.year_from)) return false
    if (input.year_to !== undefined && (paper.year === undefined || paper.year > input.year_to)) return false
    if (input.open_access === true && paper.open_access !== true && !paper.pdf_url) return false
    return true
  })
}

export function yearRange(input: SearchInput): string | undefined {
  if (input.year_from === undefined && input.year_to === undefined) return undefined
  return `${input.year_from ?? 1000}-${input.year_to ?? 3000}`
}

export function catalog(
  id: SourceId,
  name: string,
  description: string,
  homepage: string,
  credentials: string[],
  notes?: string,
) {
  return { id, name, description, homepage, credentials, notes }
}
