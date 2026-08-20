import { XMLParser } from "fast-xml-parser"
import { HttpRequestError } from "../http.js"
import { normalizeArxiv, toArray, yearFrom } from "../normalize.js"
import type { LiteratureProvider, ProviderPaper, SearchInput } from "../types.js"
import { applyCommonFilters, makePaper } from "./common.js"

const BASE = "https://export.arxiv.org/api/query"
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true })
const FIELDED = /^(?:ti|au|abs|co|jr|cat|rn|id|all):/i

type XmlNode = Record<string, unknown>

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (value && typeof value === "object") return stringValue((value as XmlNode)["#text"])
  return undefined
}

export function parseArxivXml(xml: string): ProviderPaper[] {
  const root = parser.parse(xml) as XmlNode
  const entries = toArray((root.feed as XmlNode | undefined)?.entry)
  return entries
    .map((entry) => {
      const record = entry as XmlNode
      const idUrl = stringValue(record.id) ?? ""
      if (/\/api\/errors$/i.test(idUrl) || stringValue(record.title) === "Error") {
        throw new HttpRequestError("arXiv rejected the query", { kind: "parse", retryable: false })
      }
      const arxiv = normalizeArxiv(idUrl)
      const links = toArray(record.link).filter((link): link is XmlNode => Boolean(link && typeof link === "object"))
      const pdf = links.find(
        (link) => String(link["@title"] ?? "").toLowerCase() === "pdf" || String(link["@type"] ?? "").toLowerCase() === "application/pdf",
      )?.["@href"]
      const category = toArray(record.primary_category)[0] as XmlNode | undefined
      return makePaper({
        source: "arxiv",
        source_id: arxiv ?? idUrl,
        title: record.title,
        abstract: record.summary,
        identifiers: { arxiv, doi: stringValue(record.doi) },
        url: idUrl || (arxiv ? `https://arxiv.org/abs/${arxiv}` : undefined),
        pdf_url: stringValue(pdf),
        year: yearFrom(record.published),
        authors: toArray(record.author).map((author) => stringValue((author as XmlNode | undefined)?.name)),
        venue: stringValue(category?.["@term"]) ?? "arXiv",
        open_access: true,
      })
    })
    .filter((paper): paper is ProviderPaper => Boolean(paper))
}

function expression(input: SearchInput): string {
  const raw = input.query.trim()
  const parts = [FIELDED.test(raw) ? raw : `all:${raw}`]
  if (input.year_from !== undefined || input.year_to !== undefined) {
    parts.push(`submittedDate:[${input.year_from ?? 1000}01010000 TO ${input.year_to ?? 3000}12312359]`)
  }
  return parts.join(" AND ")
}

export const arxiv: LiteratureProvider = {
  id: "arxiv",
  name: "arXiv",
  description: "Open-access preprints in physics, mathematics, computer science, and related fields.",
  homepage: "https://arxiv.org/",

  async search(input, context) {
    const params = new URLSearchParams({
      search_query: expression(input),
      start: "0",
      max_results: String(input.limit),
      sortBy: "relevance",
    })
    const xml = await context.http.requestText(`${BASE}?${params}`, {
      signal: context.signal,
      rateLimit: { minIntervalMs: 3_000, maxConcurrent: 1 },
      looksValid: (body) => /<feed[\s>]/i.test(body),
    })
    if (!/<feed[\s>]/i.test(xml)) throw new Error("arXiv returned an invalid Atom response")
    return applyCommonFilters(parseArxivXml(xml), input).slice(0, input.limit)
  },
}
