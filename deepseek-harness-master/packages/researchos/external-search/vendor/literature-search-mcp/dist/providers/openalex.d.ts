import type { LiteratureProvider, ProviderPaper } from "../types.js";
interface OpenAlexWork {
    id?: string;
    doi?: string;
    display_name?: string;
    title?: string;
    publication_year?: number;
    abstract_inverted_index?: Record<string, number[]> | null;
    authorships?: Array<{
        author?: {
            display_name?: string;
        };
    }>;
    primary_location?: {
        landing_page_url?: string;
        pdf_url?: string;
        source?: {
            display_name?: string;
        };
    };
    best_oa_location?: {
        landing_page_url?: string;
        pdf_url?: string;
        source?: {
            display_name?: string;
        };
    };
    open_access?: {
        is_oa?: boolean;
        oa_url?: string;
    };
}
interface OpenAlexResponse {
    results?: OpenAlexWork[];
}
export declare function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string | undefined;
export declare function parseOpenAlex(data: OpenAlexResponse): ProviderPaper[];
export declare const openalex: LiteratureProvider;
export {};
