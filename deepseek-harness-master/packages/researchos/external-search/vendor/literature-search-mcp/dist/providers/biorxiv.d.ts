import type { LiteratureProvider, ProviderPaper } from "../types.js";
declare const SERVERS: readonly ["biorxiv", "medrxiv"];
type PreprintServer = (typeof SERVERS)[number];
interface PreprintRecord {
    doi?: string;
    title?: string;
    authors?: string;
    abstract?: string;
    category?: string;
    date?: string;
    version?: string;
    server?: string;
}
interface PreprintMessage {
    status?: string;
    cursor?: number | string;
    count?: number | string;
    total?: number | string;
}
interface PreprintResponse {
    messages?: PreprintMessage[];
    collection?: PreprintRecord[];
}
export declare function parseBiorxiv(data: PreprintResponse, fallbackServer: PreprintServer): ProviderPaper[];
export declare const biorxiv: LiteratureProvider;
export {};
