import type { LiteratureProvider, ProviderPaper } from "../types.js";
interface EuropePmcRecord {
    id?: string;
    source?: string;
    pmid?: string;
    pmcid?: string;
    doi?: string;
    title?: string;
    abstractText?: string;
    authorString?: string;
    authorList?: {
        author?: Array<{
            fullName?: string;
            firstName?: string;
            lastName?: string;
        }>;
    };
    journalTitle?: string;
    journalInfo?: {
        journal?: {
            title?: string;
        };
    };
    pubYear?: string;
    isOpenAccess?: string;
    hasPDF?: string;
}
interface EuropePmcResponse {
    resultList?: {
        result?: EuropePmcRecord[];
    };
}
export declare function parseEuropePmc(data: EuropePmcResponse): ProviderPaper[];
export declare const europepmc: LiteratureProvider;
export {};
