/**
 * Literature Search 页面：学术文献检索（七库融合）。
 *
 * 独立一级页面（原 Writing 页 Tab 3 剥离）——经 literature-search-mcp
 * 检索 PubMed/Europe PMC/bioRxiv/Crossref/OpenAlex/Semantic Scholar/arXiv。
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { searchLiterature } from "@/lib/api/literature";
import { importPaper } from "@/lib/api/papers";
import { listProjects } from "@/lib/api/projects";
import { Card, Button, Spinner } from "@/components/ui";
import type {
  LiteratureResult,
  LiteratureSearchResponse,
  ResearchProject,
} from "@/types";

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

  // 导入相关：项目列表 + 选中项目 + 导入状态
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [targetProjectId, setTargetProjectId] = useState<number | string>("");
  const [importingKey, setImportingKey] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState<{ rank: number; ok: boolean; text: string } | null>(null);

  // 加载项目列表供导入选择
  useEffect(() => {
    listProjects(0, 50)
      .then((page) => setProjects(page.items))
      .catch((err) => console.error("Failed to load projects for import:", err));
  }, []);

  const toggleSource = (id: string) => {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  // 2026-08-15 myf: 检索结果一键入库（Phase 1）：DOI/标题 + 可选 PDF 直链 → backend Crossref 补全
  const handleImport = useCallback(async (item: LiteratureResult) => {
    if (!targetProjectId) {
      setImportMsg({ rank: item.rank, ok: false, text: "Select a project first" });
      return;
    }
    setImportingKey(item.rank);
    setImportMsg(null);
    try {
      const paper = await importPaper(Number(targetProjectId), {
        doi: item.identifiers?.doi,
        title: item.title,
        authors: item.authors,
        year: item.year,
        pdfUrl: item.pdf_url,
      });
      setImportMsg({
        rank: item.rank,
        ok: true,
        text: paper.pdfUrl
          ? `Imported → analyzing (id=${paper.id})`
          : `Imported metadata only (id=${paper.id})`,
      });
    } catch (err) {
      setImportMsg({ rank: item.rank, ok: false, text: (err as Error).message });
    } finally {
      setImportingKey(null);
    }
  }, [targetProjectId]);

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

        {/* 一键导入目标项目选择 */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          <span className="text-xs text-gray-500">
            Import results into project:
          </span>
          <select
            value={targetProjectId}
            onChange={(e) => setTargetProjectId(e.target.value)}
            className="h-9 max-w-64 rounded-md border border-gray-300 px-2 text-sm"
          >
            <option value="">Select a project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
                <LiteratureResultCard
                  key={r.rank}
                  item={r}
                  importing={importingKey === r.rank}
                  importMsg={importMsg?.rank === r.rank ? importMsg : null}
                  onImport={() => handleImport(r)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LiteratureResultCard({
  item,
  importing,
  importMsg,
  onImport,
}: {
  item: LiteratureResult;
  importing?: boolean;
  importMsg?: { rank: number; ok: boolean; text: string } | null;
  onImport: () => void;
}) {
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
          <Button
            onClick={onImport}
            disabled={importing}
            className="h-8 px-3 text-xs"
          >
            {importing ? <Spinner /> : "Import"}
          </Button>
          {importMsg && (
            <span
              className={`text-[10px] leading-tight ${
                importMsg.ok ? "text-green-600" : "text-red-600"
              }`}
            >
              {importMsg.text}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
