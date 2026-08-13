/**
 * Literature Search 页面：学术文献检索（七库融合）。
 *
 * 独立一级页面（原 Writing 页 Tab 3 剥离）——经 literature-search-mcp
 * 检索 PubMed/Europe PMC/bioRxiv/Crossref/OpenAlex/Semantic Scholar/arXiv。
 */
"use client";

import { useState } from "react";
import { searchLiterature } from "@/lib/api/literature";
import { Card, Button, Spinner } from "@/components/ui";
import type { LiteratureResult, LiteratureSearchResponse } from "@/types";

const LITERATURE_SOURCES: { id: string; label: string }[] = [
  { id: "pubmed", label: "PubMed" },
  { id: "europepmc", label: "Europe PMC" },
  { id: "biorxiv", label: "bioRxiv" },
  { id: "crossref", label: "Crossref" },
  { id: "openalex", label: "OpenAlex" },
  { id: "semantic-scholar", label: "Semantic Scholar" },
  { id: "arxiv", label: "arXiv" },
];

const SOURCE_STATUS_LABEL: Record<string, string> = {
  ok: "✅",
  empty: "Empty",
  rate_limited: "Rate Limited",
  timeout: "Timeout",
  error: "Error",
};

export default function LiteratureSearchPage() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(10);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [openAccess, setOpenAccess] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<LiteratureSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSource = (id: string) => {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setResult(null);
    try {
      const res = await searchLiterature({
        query: query.trim(),
        limit,
        sources: sources.length ? sources : undefined,
        yearFrom: yearFrom ? Number(yearFrom) : undefined,
        yearTo: yearTo ? Number(yearTo) : undefined,
        openAccess: openAccess || undefined,
      });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Literature Search</h1>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">
          Search Scholarly Literature
        </h2>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. transformer attention mechanism (arXiv field syntax supported)"
            className="h-10 flex-1 rounded-md border border-gray-300 px-3 text-sm focus:border-gray-900 focus:outline-none"
          />
          <Button onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-gray-500">
            Max Results (1-50)
            <input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) =>
                setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 10)))
              }
              className="mt-1 h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            Year From
            <input
              type="number"
              min={1000}
              max={3000}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              placeholder="e.g. 2019"
              className="mt-1 h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            Year To
            <input
              type="number"
              min={1000}
              max={3000}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              placeholder="e.g. 2024"
              className="mt-1 h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
          </label>
          <label className="flex h-9 items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={openAccess}
              onChange={(e) => setOpenAccess(e.target.checked)}
              className="h-4 w-4"
            />
            Open Access only
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="self-center text-xs text-gray-500">Sources:</span>
          {LITERATURE_SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleSource(s.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                sources.includes(s.id)
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
          {sources.length > 0 && (
            <button
              onClick={() => setSources([])}
              className="rounded-full px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      {searching && (
        <Card className="flex items-center gap-2 p-4 text-sm text-blue-600">
          <Spinner /> Searching 7 scholarly databases...
        </Card>
      )}

      {error && <Card className="p-4 text-sm text-red-600">{error}</Card>}

      {result && !searching && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>
              {result.returned} results / {result.total_candidates} candidates
            </span>
            <span className="text-gray-300">|</span>
            <span className="flex flex-wrap items-center gap-1">
              {result.source_statuses.map((s) => (
                <span
                  key={s.source}
                  className="rounded bg-gray-100 px-1.5 py-0.5"
                  title={s.status === "error" ? s.error?.message : s.source}
                >
                  {s.source}: {SOURCE_STATUS_LABEL[s.status] ?? s.status} (
                  {s.result_count})
                </span>
              ))}
            </span>
          </div>
          <div className="space-y-3">
            {result.results.length === 0 ? (
              <Card className="p-6 text-center text-sm text-gray-500">
                No matching literature found. Try adjusting keywords or relaxing filters.
              </Card>
            ) : (
              result.results.map((r) => (
                <LiteratureResultCard key={r.rank} item={r} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LiteratureResultCard({ item }: { item: LiteratureResult }) {
  const authors = item.authors?.slice(0, 5).join(", ");
  const moreAuthors = (item.authors?.length ?? 0) > 5;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
              {item.rank}
            </span>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="truncate font-medium text-gray-900 hover:underline"
            >
              {item.title}
            </a>
            {item.open_access && (
              <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
                OA
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-xs text-gray-500">
            {authors}
            {moreAuthors ? " et al." : ""}
            {item.year ? ` · ${item.year}` : ""}
            {item.venue ? ` · ${item.venue}` : ""}
          </div>
          {item.abstract && (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600">
              {item.abstract}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
            {item.source_evidence.map((ev) => (
              <span
                key={`${ev.source}-${ev.source_id}`}
                className="rounded bg-gray-100 px-1.5 py-0.5"
              >
                {ev.source} #{ev.rank}
              </span>
            ))}
            {item.identifiers.doi && <span>DOI: {item.identifiers.doi}</span>}
            {item.identifiers.pmid && <span>PMID: {item.identifiers.pmid}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {item.pdf_url && (
            <a
              href={item.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              PDF
            </a>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Open
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
