import { yearFrom } from "../normalize.js";
import { applyCommonFilters, makePaper } from "./common.js";
const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
export function parseEuropePmc(data) {
    return (data.resultList?.result ?? []).map((record) => {
        const sourceId = record.source && record.id ? `${record.source}/${record.id}` : record.id ?? record.pmid ?? record.doi ?? "";
        const authors = record.authorList?.author?.map((author) => author.fullName ?? [author.firstName, author.lastName].filter(Boolean).join(" ")) ?? (record.authorString ? record.authorString.split(/,\s*|;\s*/) : []);
        const open = record.isOpenAccess === "Y" || record.hasPDF === "Y";
        return makePaper({
            source: "europepmc",
            source_id: sourceId,
            title: record.title,
            abstract: record.abstractText,
            identifiers: { doi: record.doi, pmid: record.pmid, pmcid: record.pmcid },
            url: record.source && record.id ? `https://europepmc.org/article/${record.source}/${record.id}` : undefined,
            pdf_url: record.pmcid && open ? `https://europepmc.org/articles/${record.pmcid}?pdf=render` : undefined,
            year: yearFrom(record.pubYear),
            authors,
            venue: record.journalInfo?.journal?.title ?? record.journalTitle,
            open_access: open || undefined,
        });
    });
}
function query(input) {
    const parts = [`(${input.query})`];
    if (input.year_from !== undefined)
        parts.push(`FIRST_PDATE:[${input.year_from}-01-01 TO 3000-12-31]`);
    if (input.year_to !== undefined)
        parts.push(`FIRST_PDATE:[1000-01-01 TO ${input.year_to}-12-31]`);
    if (input.open_access)
        parts.push("OPEN_ACCESS:Y");
    return parts.join(" AND ");
}
export const europepmc = {
    id: "europepmc",
    name: "Europe PMC",
    description: "Life-science articles and preprints with rich abstract and open-access metadata.",
    homepage: "https://europepmc.org/",
    async search(input, context) {
        const params = new URLSearchParams({
            query: query(input),
            format: "json",
            resultType: "core",
            pageSize: String(input.limit),
            sort: "CITED desc",
        });
        const data = await context.http.getJson(`${BASE}?${params}`, { signal: context.signal });
        return applyCommonFilters(parseEuropePmc(data), input).slice(0, input.limit);
    },
};
//# sourceMappingURL=europepmc.js.map