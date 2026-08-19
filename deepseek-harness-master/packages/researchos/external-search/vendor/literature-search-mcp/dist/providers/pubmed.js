import { XMLParser } from "fast-xml-parser";
import { toArray, yearFrom } from "../normalize.js";
import { applyCommonFilters, makePaper } from "./common.js";
const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true });
function text(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value === "string" || typeof value === "number")
        return String(value).trim() || undefined;
    if (Array.isArray(value))
        return value.map(text).filter(Boolean).join(" ") || undefined;
    if (typeof value === "object") {
        const node = value;
        return Object.entries(node)
            .filter(([key]) => !key.startsWith("@"))
            .map(([, child]) => text(child))
            .filter(Boolean)
            .join(" ") || undefined;
    }
    return undefined;
}
function articleIds(value) {
    const result = {};
    for (const item of toArray(value?.ArticleId)) {
        if (!item || typeof item !== "object")
            continue;
        const node = item;
        const type = String(node["@IdType"] ?? "").toLowerCase();
        const id = text(node);
        if (type && id)
            result[type] = id;
    }
    return result;
}
export function parsePubmedXml(xml) {
    const root = parser.parse(xml);
    const articles = toArray(root.PubmedArticleSet?.PubmedArticle);
    return articles.map((entry) => {
        const record = entry;
        const citation = (record.MedlineCitation ?? {});
        const article = (citation.Article ?? {});
        const journal = (article.Journal ?? {});
        const issue = (journal.JournalIssue ?? {});
        const pubDate = (issue.PubDate ?? {});
        const data = (record.PubmedData ?? {});
        const ids = articleIds(data.ArticleIdList);
        const pmid = text(citation.PMID) ?? ids.pubmed ?? "";
        const pmcid = ids.pmc;
        const authors = toArray(article.AuthorList?.Author).map((author) => {
            const node = author;
            return text(node.CollectiveName) ?? [text(node.ForeName), text(node.LastName)].filter(Boolean).join(" ");
        });
        const abstract = toArray(article.Abstract?.AbstractText)
            .map((part) => text(part))
            .filter(Boolean)
            .join(" ");
        return makePaper({
            source: "pubmed",
            source_id: pmid,
            title: text(article.ArticleTitle),
            abstract,
            identifiers: { pmid, pmcid, doi: ids.doi },
            url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
            pdf_url: pmcid ? `https://europepmc.org/articles/${pmcid}?pdf=render` : undefined,
            year: yearFrom(pubDate.Year ?? pubDate.MedlineDate ?? data.History),
            authors,
            venue: journal.Title,
            open_access: pmcid ? true : undefined,
        });
    });
}
function commonParams() {
    const params = new URLSearchParams({ tool: process.env.NCBI_TOOL?.trim() || "literature-search-mcp" });
    const email = process.env.NCBI_EMAIL?.trim();
    const key = process.env.NCBI_API_KEY?.trim();
    if (email)
        params.set("email", email);
    if (key)
        params.set("api_key", key);
    return params;
}
function pubmedQuery(input) {
    const parts = [`(${input.query})`];
    if (input.year_from !== undefined || input.year_to !== undefined) {
        parts.push(`(${input.year_from ?? 1000}:${input.year_to ?? 3000}[pdat])`);
    }
    if (input.open_access)
        parts.push("free full text[sb]");
    return parts.join(" AND ");
}
export const pubmed = {
    id: "pubmed",
    name: "PubMed",
    description: "Biomedical citations and abstracts from NCBI MEDLINE/PubMed.",
    homepage: "https://pubmed.ncbi.nlm.nih.gov/",
    async search(input, context) {
        const params = commonParams();
        params.set("db", "pubmed");
        params.set("retmode", "json");
        params.set("sort", "relevance");
        params.set("retmax", String(input.limit));
        params.set("term", pubmedQuery(input));
        const keyed = Boolean(process.env.NCBI_API_KEY?.trim());
        const rateLimit = { minIntervalMs: keyed ? 100 : 334, maxConcurrent: keyed ? 10 : 3 };
        const search = await context.http.getJson(`${BASE}/esearch.fcgi?${params}`, {
            signal: context.signal,
            rateLimit,
        });
        const ids = (search.esearchresult?.idlist ?? []).map(String).filter(Boolean);
        if (ids.length === 0)
            return [];
        const fetchParams = commonParams();
        fetchParams.set("db", "pubmed");
        fetchParams.set("retmode", "xml");
        fetchParams.set("rettype", "abstract");
        fetchParams.set("id", ids.join(","));
        const xml = await context.http.requestText(`${BASE}/efetch.fcgi?${fetchParams}`, {
            signal: context.signal,
            rateLimit,
            looksValid: (body) => body.includes("<PubmedArticleSet"),
        });
        const papers = parsePubmedXml(xml).map((paper) => (input.open_access ? { ...paper, open_access: true } : paper));
        return applyCommonFilters(papers, input).slice(0, input.limit);
    },
};
//# sourceMappingURL=pubmed.js.map