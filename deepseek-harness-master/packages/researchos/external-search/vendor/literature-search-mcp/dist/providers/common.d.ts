import type { ProviderPaper, SearchInput, SourceId } from "../types.js";
export declare function makePaper(input: Omit<ProviderPaper, "identifiers" | "abstract" | "authors" | "venue" | "title"> & {
    title: unknown;
    abstract?: unknown;
    authors?: unknown[];
    venue?: unknown;
    identifiers?: ProviderPaper["identifiers"];
}): ProviderPaper;
export declare function applyCommonFilters(papers: ProviderPaper[], input: SearchInput): ProviderPaper[];
export declare function yearRange(input: SearchInput): string | undefined;
export declare function catalog(id: SourceId, name: string, description: string, homepage: string, credentials: string[], notes?: string): {
    id: "pubmed" | "europepmc" | "biorxiv" | "crossref" | "openalex" | "semantic-scholar" | "arxiv";
    name: string;
    description: string;
    homepage: string;
    credentials: string[];
    notes: string | undefined;
};
