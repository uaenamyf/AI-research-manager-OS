import type { LiteratureProvider, ProviderPaper } from "../types.js";
interface SemanticPaper {
    paperId?: string;
    title?: string;
    abstract?: string;
    url?: string;
    year?: number;
    venue?: string;
    authors?: Array<{
        name?: string;
    }>;
    externalIds?: Record<string, string | number | null>;
    openAccessPdf?: {
        url?: string;
        status?: string;
    } | null;
}
interface SemanticResponse {
    data?: SemanticPaper[];
}
export declare function parseSemanticScholar(data: SemanticResponse): ProviderPaper[];
export declare const semanticScholar: LiteratureProvider;
export {};
