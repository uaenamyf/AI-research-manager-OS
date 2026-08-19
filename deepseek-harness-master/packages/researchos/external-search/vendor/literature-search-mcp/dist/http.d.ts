export type HttpErrorKind = "http" | "network" | "timeout" | "abort" | "parse";
export declare class HttpRequestError extends Error {
    readonly kind: HttpErrorKind;
    readonly status?: number;
    readonly retryable: boolean;
    constructor(message: string, options: {
        kind: HttpErrorKind;
        status?: number;
        retryable: boolean;
        cause?: unknown;
    });
}
export interface RateLimit {
    minIntervalMs?: number;
    maxConcurrent?: number;
}
export interface HttpRequestOptions extends Omit<RequestInit, "signal"> {
    signal?: AbortSignal;
    timeoutMs?: number;
    retries?: number;
    cacheTtlMs?: number;
    rateLimit?: RateLimit;
    looksValid?: (body: string) => boolean;
}
export interface HttpClientOptions {
    fetch?: typeof globalThis.fetch;
    userAgent?: string;
    timeoutMs?: number;
    retries?: number;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    now?: () => number;
}
export declare class HttpClient {
    private readonly fetchImpl;
    private readonly userAgent;
    private readonly timeoutMs;
    private readonly retries;
    private readonly sleepImpl;
    private readonly now;
    private readonly cache;
    private readonly hosts;
    constructor(options?: HttpClientOptions);
    getJson<T>(url: string, options?: HttpRequestOptions): Promise<T>;
    requestText(url: string, options?: HttpRequestOptions): Promise<string>;
    clearCache(): void;
    resetRateLimits(): void;
    private putCache;
    private pruneCache;
    private acquire;
    private drainHost;
}
export declare function retryAfterMs(value: string | null | undefined, attempt: number, now?: () => number): number;
export declare function sanitizedError(error: unknown): {
    type: string;
    message: string;
    status?: number;
    retryable: boolean;
};
