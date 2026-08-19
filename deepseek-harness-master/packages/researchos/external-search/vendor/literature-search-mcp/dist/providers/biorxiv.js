import { sanitizedError } from "../http.js";
import { normalizeDoi, yearFrom } from "../normalize.js";
import { applyCommonFilters, makePaper } from "./common.js";
const BASE = "https://api.biorxiv.org/details";
const SERVERS = ["biorxiv", "medrxiv"];
const MAX_RECENT_POOL = 200;
const MAX_PAGES_PER_SERVER = 10;
export function parseBiorxiv(data, fallbackServer) {
    return (data.collection ?? []).map((record) => {
        const server = record.server?.toLowerCase() === "medrxiv" ? "medrxiv" : fallbackServer;
        const doi = normalizeDoi(record.doi);
        const version = record.version ?? "1";
        const base = doi ? `https://www.${server}.org/content/${doi}v${version}` : undefined;
        return makePaper({
            source: "biorxiv",
            source_id: `${server}:${doi ?? record.doi ?? ""}`,
            title: record.title,
            abstract: record.abstract,
            identifiers: { doi, biorxiv: doi },
            url: base,
            pdf_url: base ? `${base}.full.pdf` : undefined,
            year: yearFrom(record.date),
            authors: record.authors?.split(/;\s*|,\s*(?=[A-Z][a-z]+(?:\s|$))/),
            venue: server === "medrxiv" ? "medRxiv" : "bioRxiv",
            open_access: true,
        });
    });
}
function terms(query) {
    return query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length > 1);
}
function score(paper, queryTerms) {
    const haystack = `${paper.title} ${paper.abstract ?? ""} ${paper.authors?.join(" ") ?? ""} ${paper.venue ?? ""}`.toLowerCase();
    return queryTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
}
function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
async function byDoi(server, doi, context) {
    const data = await context.http.getJson(`${BASE}/${server}/${doi}`, {
        signal: context.signal,
        rateLimit: { maxConcurrent: 2 },
    });
    return parseBiorxiv(data, server);
}
async function recent(server, pool, context) {
    const papers = [];
    let cursor = 0;
    for (let page = 0; page < MAX_PAGES_PER_SERVER && papers.length < pool; page++) {
        let data;
        try {
            data = await context.http.getJson(`${BASE}/${server}/${pool}/${cursor}`, {
                signal: context.signal,
                rateLimit: { maxConcurrent: 2 },
            });
        }
        catch (error) {
            if (papers.length === 0)
                throw error;
            const detail = sanitizedError(error);
            context.warnings?.push(`${server} pagination stopped at cursor ${cursor}: ${detail.type}`);
            break;
        }
        const pagePapers = parseBiorxiv(data, server);
        papers.push(...pagePapers);
        const message = data.messages?.[0];
        const total = numberValue(message?.total);
        const count = pagePapers.length || numberValue(message?.count) || 0;
        if (count === 0 || pagePapers.length === 0 || (total !== undefined && cursor + count >= total))
            break;
        cursor += count;
    }
    return papers.slice(0, pool);
}
export const biorxiv = {
    id: "biorxiv",
    name: "bioRxiv / medRxiv",
    description: "Biology and health-science preprints from the bioRxiv public API.",
    homepage: "https://www.biorxiv.org/",
    async search(input, context) {
        const doi = normalizeDoi(input.query);
        const pool = Math.min(MAX_RECENT_POOL, Math.max(100, input.limit * 5));
        const requests = SERVERS.map((server) => (doi ? byDoi(server, doi, context) : recent(server, pool, context)));
        const settled = await Promise.allSettled(requests);
        const fulfilled = [];
        for (let index = 0; index < settled.length; index++) {
            const outcome = settled[index];
            const server = SERVERS[index];
            if (!outcome || !server)
                continue;
            if (outcome.status === "fulfilled")
                fulfilled.push(outcome.value);
            else
                context.warnings?.push(`${server} backend failed: ${sanitizedError(outcome.reason).type}`);
        }
        if (fulfilled.length === 0) {
            const firstFailure = settled.find((outcome) => outcome.status === "rejected");
            throw firstFailure?.reason ?? new Error("bioRxiv and medRxiv backends failed");
        }
        const papers = applyCommonFilters(fulfilled.flat(), input);
        if (doi)
            return papers.slice(0, input.limit);
        const queryTerms = terms(input.query);
        return papers
            .map((paper, index) => ({ paper, index, score: score(paper, queryTerms) }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score || (b.paper.year ?? 0) - (a.paper.year ?? 0) || a.index - b.index)
            .slice(0, input.limit)
            .map((item) => item.paper);
    },
};
//# sourceMappingURL=biorxiv.js.map