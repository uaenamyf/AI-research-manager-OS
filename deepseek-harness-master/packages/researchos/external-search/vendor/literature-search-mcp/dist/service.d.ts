import { HistoryStore } from "./history.js";
import { HttpClient } from "./http.js";
import type { LiteratureProvider, SearchInput, SearchResponse } from "./types.js";
export interface SearchServiceOptions {
    providers?: LiteratureProvider[];
    http?: HttpClient;
    history?: HistoryStore;
    now?: () => number;
}
export declare class LiteratureSearchService {
    private readonly providers;
    private readonly http;
    private readonly history;
    private readonly now;
    constructor(options?: SearchServiceOptions);
    search(raw: Partial<SearchInput> & Pick<SearchInput, "query">, signal?: AbortSignal): Promise<SearchResponse>;
}
export declare function normalizeInput(raw: Partial<SearchInput> & Pick<SearchInput, "query">): SearchInput;
