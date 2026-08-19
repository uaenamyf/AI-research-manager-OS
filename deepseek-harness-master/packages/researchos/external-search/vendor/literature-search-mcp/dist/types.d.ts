export declare const SOURCE_ORDER: readonly ["pubmed", "europepmc", "biorxiv", "crossref", "openalex", "semantic-scholar", "arxiv"];
export type SourceId = (typeof SOURCE_ORDER)[number];
export interface SearchInput {
    query: string;
    limit: number;
    sources?: SourceId[];
    year_from?: number;
    year_to?: number;
    open_access?: boolean;
}
export interface Identifiers {
    doi?: string;
    pmid?: string;
    pmcid?: string;
    arxiv?: string;
    openalex?: string;
    semantic_scholar?: string;
    biorxiv?: string;
}
export interface ProviderPaper {
    source: SourceId;
    source_id: string;
    title: string;
    abstract?: string;
    identifiers: Identifiers;
    url?: string;
    pdf_url?: string;
    year?: number;
    authors?: string[];
    venue?: string;
    open_access?: boolean;
    /** Internal normalization flag: display title is synthetic and must not be used for title deduplication. */
    title_missing?: boolean;
}
export interface SourceEvidence {
    source: SourceId;
    rank: number;
    source_id: string;
    url?: string;
    pdf_url?: string;
}
export interface LiteratureResult {
    rank: number;
    fused_score: number;
    title: string;
    abstract?: string;
    identifiers: Identifiers;
    url?: string;
    pdf_url?: string;
    year?: number;
    authors?: string[];
    venue?: string;
    open_access?: boolean;
    source_evidence: SourceEvidence[];
}
export interface SourceStatus {
    source: SourceId;
    status: "ok" | "empty" | "rate_limited" | "timeout" | "error";
    result_count: number;
    duration_ms: number;
    warnings?: string[];
    error?: {
        type: string;
        message: string;
        status?: number;
        retryable: boolean;
    };
}
export interface SearchResponse {
    query: string;
    parameters: Omit<SearchInput, "query">;
    results: LiteratureResult[];
    source_statuses: SourceStatus[];
    total_candidates: number;
    returned: number;
    all_sources_failed: boolean;
}
export interface ProviderContext {
    http: import("./http.js").HttpClient;
    signal?: AbortSignal;
    /** Providers may report recoverable sub-backend/page failures here. */
    warnings?: string[];
}
export interface LiteratureProvider {
    id: SourceId;
    name: string;
    description: string;
    homepage: string;
    search(input: SearchInput, context: ProviderContext): Promise<ProviderPaper[]>;
}
export interface SourceCatalogEntry {
    id: SourceId;
    name: string;
    description: string;
    homepage: string;
    credentials: string[];
    notes?: string;
}
