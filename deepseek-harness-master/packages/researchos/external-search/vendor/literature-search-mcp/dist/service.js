import { deduplicateAndFuse } from "./aggregate.js";
import { HistoryStore } from "./history.js";
import { HttpClient, sanitizedError } from "./http.js";
import { providers as defaultProviders } from "./providers/index.js";
import { applyCommonFilters } from "./providers/common.js";
import { SOURCE_ORDER } from "./types.js";
export class LiteratureSearchService {
    providers;
    http;
    history;
    now;
    constructor(options = {}) {
        const supplied = options.providers ?? defaultProviders;
        this.providers = [...supplied].sort((a, b) => SOURCE_ORDER.indexOf(a.id) - SOURCE_ORDER.indexOf(b.id));
        this.http = options.http ?? new HttpClient();
        this.history = options.history ?? new HistoryStore();
        this.now = options.now ?? Date.now;
    }
    async search(raw, signal) {
        const input = normalizeInput(raw);
        const wanted = new Set(input.sources ?? SOURCE_ORDER);
        const selected = this.providers.filter((provider) => wanted.has(provider.id));
        const outcomes = await Promise.all(selected.map(async (provider) => {
            const started = this.now();
            const warnings = [];
            try {
                const papers = applyCommonFilters(await provider.search(input, { http: this.http, signal, warnings }), input).slice(0, input.limit);
                const status = {
                    source: provider.id,
                    status: papers.length > 0 ? "ok" : "empty",
                    result_count: papers.length,
                    duration_ms: Math.max(0, this.now() - started),
                    warnings: warnings.length ? warnings : undefined,
                };
                return { source: provider.id, papers, status };
            }
            catch (error) {
                if (signal?.aborted)
                    throw error;
                const detail = sanitizedError(error);
                const status = {
                    source: provider.id,
                    status: detail.status === 429 ? "rate_limited" : detail.type === "timeout" ? "timeout" : "error",
                    result_count: 0,
                    duration_ms: Math.max(0, this.now() - started),
                    warnings: warnings.length ? warnings : undefined,
                    error: detail,
                };
                return { source: provider.id, papers: [], status };
            }
        }));
        const results = deduplicateAndFuse(outcomes.map((outcome) => ({ source: outcome.source, papers: outcome.papers })), input.limit);
        const response = {
            query: input.query,
            parameters: {
                limit: input.limit,
                sources: selected.map((provider) => provider.id),
                year_from: input.year_from,
                year_to: input.year_to,
                open_access: input.open_access,
            },
            results,
            source_statuses: outcomes.map((outcome) => outcome.status),
            total_candidates: outcomes.reduce((total, outcome) => total + outcome.papers.length, 0),
            returned: results.length,
            all_sources_failed: outcomes.length > 0 &&
                outcomes.every((outcome) => ["error", "rate_limited", "timeout"].includes(outcome.status.status)),
        };
        await this.history.append(response);
        return response;
    }
}
export function normalizeInput(raw) {
    const query = raw.query.trim();
    if (!query)
        throw new Error("query must not be empty");
    const limit = Math.min(50, Math.max(1, Math.trunc(raw.limit ?? 10)));
    if (raw.year_from !== undefined && raw.year_to !== undefined && raw.year_from > raw.year_to) {
        throw new Error("year_from must be less than or equal to year_to");
    }
    const requested = raw.sources ? new Set(raw.sources) : undefined;
    const sources = requested ? SOURCE_ORDER.filter((source) => requested.has(source)) : undefined;
    if (requested && (!sources || sources.length === 0))
        throw new Error("sources must include at least one supported source");
    return {
        query,
        limit,
        sources,
        year_from: raw.year_from,
        year_to: raw.year_to,
        open_access: raw.open_access,
    };
}
//# sourceMappingURL=service.js.map