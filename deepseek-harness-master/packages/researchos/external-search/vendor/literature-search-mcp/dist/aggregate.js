import { normalizeIdentifiers, normalizeTitle } from "./normalize.js";
import { SOURCE_ORDER } from "./types.js";
const RRF_K = 60;
const sourceIndex = new Map(SOURCE_ORDER.map((source, index) => [source, index]));
const strongTypes = ["doi", "pmid", "arxiv"];
class DisjointSet {
    parent;
    rank;
    constructor(size) {
        this.parent = Array.from({ length: size }, (_, index) => index);
        this.rank = Array.from({ length: size }, () => 0);
    }
    find(index) {
        const parent = this.parent[index];
        if (parent === undefined)
            throw new Error("Invalid disjoint-set index");
        if (parent !== index)
            this.parent[index] = this.find(parent);
        return this.parent[index];
    }
    union(left, right) {
        let a = this.find(left);
        let b = this.find(right);
        if (a === b)
            return a;
        const rankA = this.rank[a] ?? 0;
        const rankB = this.rank[b] ?? 0;
        if (rankA < rankB)
            [a, b] = [b, a];
        this.parent[b] = a;
        if (rankA === rankB)
            this.rank[a] = rankA + 1;
        return a;
    }
}
export function deduplicateAndFuse(providerResults, limit) {
    const candidates = flatten(providerResults);
    const dsu = new DisjointSet(candidates.length);
    unionStrongIdentifiers(candidates, dsu);
    unionCompatibleTitles(candidates, dsu);
    const grouped = new Map();
    for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (!candidate)
            continue;
        const root = dsu.find(index);
        const members = grouped.get(root) ?? [];
        members.push(candidate);
        grouped.set(root, members);
    }
    return [...grouped.values()]
        .map(buildGroup)
        .sort((a, b) => b.score - a.score ||
        a.bestSource - b.bestSource ||
        a.bestRank - b.bestRank ||
        a.titleKey.localeCompare(b.titleKey) ||
        a.serial - b.serial)
        .slice(0, limit)
        .map((group, index) => ({
        rank: index + 1,
        fused_score: Number(group.score.toFixed(8)),
        title: group.title,
        abstract: group.abstract,
        identifiers: group.identifiers,
        url: group.url,
        pdf_url: group.pdfUrl,
        year: group.year,
        authors: group.authors,
        venue: group.venue,
        open_access: group.openAccess,
        source_evidence: group.evidence,
    }));
}
function flatten(providerResults) {
    const sorted = [...providerResults].sort((a, b) => (sourceIndex.get(a.source) ?? SOURCE_ORDER.length) - (sourceIndex.get(b.source) ?? SOURCE_ORDER.length));
    const candidates = [];
    for (const provider of sorted) {
        for (let index = 0; index < provider.papers.length; index++) {
            const paper = provider.papers[index];
            if (!paper)
                continue;
            const normalized = normalizeTitle(paper.title);
            candidates.push({
                paper,
                source: provider.source,
                rank: index + 1,
                ids: normalizeIdentifiers(paper.identifiers),
                titleKey: isTitleEligible(paper, normalized) ? normalized : undefined,
                serial: candidates.length,
            });
        }
    }
    return candidates;
}
function isTitleEligible(paper, normalized) {
    if (paper.title_missing || !normalized)
        return false;
    return !/^(?:untitled|unknown title|no title)$/.test(normalized);
}
function unionStrongIdentifiers(candidates, dsu) {
    const maps = { doi: new Map(), pmid: new Map(), arxiv: new Map() };
    for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (!candidate)
            continue;
        for (const type of strongTypes) {
            const value = candidate.ids[type];
            if (!value)
                continue;
            const existing = maps[type].get(value);
            if (existing !== undefined)
                dsu.union(index, existing);
            else
                maps[type].set(value, index);
        }
    }
}
function unionCompatibleTitles(candidates, dsu) {
    const byTitle = new Map();
    for (let index = 0; index < candidates.length; index++) {
        const titleKey = candidates[index]?.titleKey;
        if (!titleKey)
            continue;
        const roots = byTitle.get(titleKey) ?? [];
        roots.push(index);
        byTitle.set(titleKey, roots);
    }
    for (const indices of byTitle.values()) {
        const components = [];
        for (const index of indices) {
            let root = dsu.find(index);
            const existingSame = components.find((component) => dsu.find(component.root) === root);
            if (existingSame)
                continue;
            const ids = componentStrongIds(candidates, dsu, root);
            const compatible = components.find((component) => !strongSetsConflict(component.ids, ids));
            if (!compatible) {
                components.push({ root, ids });
                continue;
            }
            root = dsu.union(compatible.root, root);
            compatible.root = root;
            mergeStrongSets(compatible.ids, ids);
        }
    }
}
function componentStrongIds(candidates, dsu, root) {
    const ids = { doi: new Set(), pmid: new Set(), arxiv: new Set() };
    for (let index = 0; index < candidates.length; index++) {
        if (dsu.find(index) !== root)
            continue;
        const candidate = candidates[index];
        if (!candidate)
            continue;
        for (const type of strongTypes) {
            const value = candidate.ids[type];
            if (value)
                ids[type].add(value);
        }
    }
    return ids;
}
function strongSetsConflict(left, right) {
    return strongTypes.some((type) => left[type].size > 0 && right[type].size > 0);
}
function mergeStrongSets(target, source) {
    for (const type of strongTypes)
        for (const value of source[type])
            target[type].add(value);
}
function buildGroup(members) {
    const ordered = [...members].sort((a, b) => a.serial - b.serial);
    const firstRealTitle = ordered.find((candidate) => !candidate.paper.title_missing) ?? ordered[0];
    if (!firstRealTitle)
        throw new Error("Cannot build empty literature group");
    const identifiers = {};
    let abstract;
    let url;
    let pdfUrl;
    let year;
    let authors;
    let venue;
    let openAccess;
    const evidence = [];
    const bestRanksBySource = new Map();
    for (const candidate of ordered) {
        for (const [key, value] of Object.entries(candidate.ids)) {
            const typedKey = key;
            if (value !== undefined && identifiers[typedKey] === undefined)
                identifiers[typedKey] = value;
        }
        if ((candidate.paper.abstract?.length ?? 0) > (abstract?.length ?? 0))
            abstract = candidate.paper.abstract;
        url ??= candidate.paper.url;
        pdfUrl ??= candidate.paper.pdf_url;
        year ??= candidate.paper.year;
        if (!authors?.length && candidate.paper.authors?.length)
            authors = candidate.paper.authors;
        venue ??= candidate.paper.venue;
        if (candidate.paper.open_access === true)
            openAccess = true;
        evidence.push({
            source: candidate.source,
            rank: candidate.rank,
            source_id: candidate.paper.source_id,
            url: candidate.paper.url,
            pdf_url: candidate.paper.pdf_url,
        });
        const currentRank = bestRanksBySource.get(candidate.source);
        if (currentRank === undefined || candidate.rank < currentRank)
            bestRanksBySource.set(candidate.source, candidate.rank);
    }
    const score = [...bestRanksBySource.values()].reduce((total, rank) => total + 1 / (RRF_K + rank), 0);
    evidence.sort((a, b) => (sourceIndex.get(a.source) ?? SOURCE_ORDER.length) - (sourceIndex.get(b.source) ?? SOURCE_ORDER.length) ||
        a.rank - b.rank ||
        a.source_id.localeCompare(b.source_id));
    return {
        title: firstRealTitle.paper.title,
        titleKey: normalizeTitle(firstRealTitle.paper.title),
        abstract,
        identifiers,
        url,
        pdfUrl,
        year,
        authors,
        venue,
        openAccess,
        evidence,
        score,
        bestSource: Math.min(...ordered.map((candidate) => sourceIndex.get(candidate.source) ?? SOURCE_ORDER.length)),
        bestRank: Math.min(...ordered.map((candidate) => candidate.rank)),
        serial: ordered[0]?.serial ?? 0,
    };
}
//# sourceMappingURL=aggregate.js.map