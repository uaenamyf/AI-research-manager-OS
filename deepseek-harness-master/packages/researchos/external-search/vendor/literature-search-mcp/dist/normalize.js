const DOI_PREFIX = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i;
const ARXIV_PREFIX = /^(?:https?:\/\/arxiv\.org\/(?:abs|pdf)\/|arxiv:\s*)/i;
export function cleanText(value) {
    if (typeof value !== "string")
        return undefined;
    const text = value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
    return text || undefined;
}
export function truncate(value, max = 1_200) {
    const text = cleanText(value);
    if (!text || text.length <= max)
        return text;
    const shortened = text.slice(0, max).replace(/\s+\S*$/, "").trimEnd();
    return `${shortened || text.slice(0, max)}…`;
}
export function normalizeDoi(value) {
    const text = cleanText(value)?.replace(DOI_PREFIX, "").replace(/[\s.]+$/, "").toLowerCase();
    return text && /^10\.\d{4,9}\/.+/.test(text) ? text : undefined;
}
export function normalizePmid(value) {
    const text = String(value ?? "").replace(/^pmid:\s*/i, "").trim();
    return /^\d+$/.test(text) ? text : undefined;
}
export function normalizePmcid(value) {
    const text = String(value ?? "").replace(/^pmc(?:id)?:?\s*/i, "").trim().toUpperCase();
    if (!text)
        return undefined;
    return text.startsWith("PMC") ? text : `PMC${text}`;
}
export function normalizeArxiv(value) {
    const text = cleanText(value)
        ?.replace(ARXIV_PREFIX, "")
        .replace(/\.pdf$/i, "")
        .replace(/v\d+$/i, "")
        .trim()
        .toLowerCase();
    return text && /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z-]+)?\/\d{7})$/i.test(text) ? text : undefined;
}
export function normalizeTitle(value) {
    return (cleanText(value) ?? "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}
export function normalizeIdentifiers(ids) {
    return compact({
        doi: normalizeDoi(ids.doi),
        pmid: normalizePmid(ids.pmid),
        pmcid: normalizePmcid(ids.pmcid),
        arxiv: normalizeArxiv(ids.arxiv),
        openalex: cleanText(ids.openalex)?.replace(/^https?:\/\/openalex\.org\//i, "").toUpperCase(),
        semantic_scholar: cleanText(ids.semantic_scholar),
        biorxiv: normalizeDoi(ids.biorxiv),
    });
}
export function compact(record) {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ""));
}
export function firstString(value) {
    if (Array.isArray(value))
        return value.map(cleanText).find(Boolean);
    return cleanText(value);
}
export function toArray(value) {
    if (value === undefined || value === null)
        return [];
    return Array.isArray(value) ? value : [value];
}
export function yearFrom(value) {
    const match = String(value ?? "").match(/(?:19|20)\d{2}/);
    if (!match)
        return undefined;
    const year = Number(match[0]);
    return Number.isInteger(year) ? year : undefined;
}
export function chooseUrl(ids, url) {
    if (url)
        return url;
    if (ids.doi)
        return `https://doi.org/${ids.doi}`;
    if (ids.pmid)
        return `https://pubmed.ncbi.nlm.nih.gov/${ids.pmid}/`;
    if (ids.arxiv)
        return `https://arxiv.org/abs/${ids.arxiv}`;
    return undefined;
}
//# sourceMappingURL=normalize.js.map