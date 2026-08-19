import type { SearchResponse } from "./types.js";
export declare function defaultHistoryPath(env?: NodeJS.ProcessEnv): string;
export interface HistoryStoreOptions {
    path?: string;
    log?: (message: string) => void;
}
export declare class HistoryStore {
    readonly path: string;
    private readonly log;
    constructor(options?: HistoryStoreOptions);
    append(response: SearchResponse): Promise<void>;
    clear(): Promise<void>;
}
