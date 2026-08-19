import type { LiteratureProvider, ProviderPaper } from "../types.js";
interface CrossrefWork {
    DOI?: string;
    title?: string[];
    subtitle?: string[];
    abstract?: string;
    author?: Array<{
        given?: string;
        family?: string;
        name?: string;
    }>;
    "container-title"?: string[];
    URL?: string;
    issued?: {
        "date-parts"?: number[][];
    };
    published?: {
        "date-parts"?: number[][];
    };
    link?: Array<{
        URL?: string;
        "content-type"?: string;
    }>;
    license?: Array<{
        URL?: string;
    }>;
    resource?: {
        primary?: {
            URL?: string;
        };
    };
}
interface CrossrefResponse {
    message?: {
        items?: CrossrefWork[];
    };
}
export declare function parseCrossref(data: CrossrefResponse): ProviderPaper[];
export declare const crossref: LiteratureProvider;
export {};
