import type { LiteratureProvider, SourceCatalogEntry } from "../types.js"
import { SOURCE_ORDER } from "../types.js"
import { arxiv } from "./arxiv.js"
import { biorxiv } from "./biorxiv.js"
import { crossref } from "./crossref.js"
import { europepmc } from "./europepmc.js"
import { openalex } from "./openalex.js"
import { pubmed } from "./pubmed.js"
import { semanticScholar } from "./semantic-scholar.js"

export { arxiv, biorxiv, crossref, europepmc, openalex, pubmed, semanticScholar }

export const providers: LiteratureProvider[] = [
  pubmed,
  europepmc,
  biorxiv,
  crossref,
  openalex,
  semanticScholar,
  arxiv,
]

if (providers.some((provider, index) => provider.id !== SOURCE_ORDER[index])) {
  throw new Error("Provider order must match SOURCE_ORDER")
}

const credentialMap: Record<(typeof SOURCE_ORDER)[number], string[]> = {
  pubmed: ["NCBI_TOOL", "NCBI_EMAIL", "NCBI_API_KEY"],
  europepmc: [],
  biorxiv: [],
  crossref: ["CROSSREF_MAILTO"],
  openalex: ["OPENALEX_MAILTO", "OPENALEX_API_KEY"],
  "semantic-scholar": ["SEMANTIC_SCHOLAR_API_KEY"],
  arxiv: [],
}

const notes: Partial<Record<(typeof SOURCE_ORDER)[number], string>> = {
  biorxiv: "The public API has no full-text query endpoint; non-DOI searches rank a bounded recent-preprint window locally.",
  arxiv: "Requests are paced to at most one concurrent request and one request start every three seconds.",
  pubmed: "Runs keyless at three requests per second, or ten requests per second when NCBI_API_KEY is set.",
}

export function sourceCatalog(list: LiteratureProvider[] = providers): SourceCatalogEntry[] {
  return list.map((provider) => ({
    id: provider.id,
    name: provider.name,
    description: provider.description,
    homepage: provider.homepage,
    credentials: credentialMap[provider.id],
    notes: notes[provider.id],
  }))
}
