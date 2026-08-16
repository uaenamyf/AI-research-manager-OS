/**
 * Export 页面：文献导出 + 段落级推荐（从 Writing Tab 3 独立）。
 *
 * 聚焦三个实用功能：
 * 1. 选论文 → 批量导出 BibTeX / RIS
 * 2. 粘贴文本 → 段落级文献推荐
 * 3. 单篇引用渲染（APA/MLA/GB-T 7714）
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import type { PaperListItem, ResearchProject, ID } from "@/types";
import { getCitation, getBibliography } from "@/lib/api/citation";
import type { CitationFormat } from "@/lib/api/citation";
import { recommendPapers } from "@/lib/api/papers";
import type { RecommendResult } from "@/lib/api/papers";
import { exportBibtexBatch, exportRisBatch } from "@/lib/api/export";
import { Card, Button, Spinner } from "@/components/ui";

export default function ExportPage() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ID | null>(null);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"export" | "recommend">("export");

  useEffect(() => {
    listProjects(0, 50).then((p) => {
      setProjects(p.items);
      if (p.items[0]) setSelectedProject(p.items[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    listPapers(selectedProject, -1, 0, 200).then((p) => setPapers(p.items));
    setSelectedIds(new Set());
  }, [selectedProject]);

  const togglePaper = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredPapers = papers.filter(
    (p) =>
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectAll = () => setSelectedIds(new Set(filteredPapers.map((p) => p.id)));
  const clearAll = () => setSelectedIds(new Set());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Export & References</h1>

      <div className="flex gap-2">
        <Button
          variant={tab === "export" ? "default" : "outline"}
          onClick={() => setTab("export")}
        >
          BibTeX / RIS Export
        </Button>
        <Button
          variant={tab === "recommend" ? "default" : "outline"}
          onClick={() => setTab("recommend")}
        >
          Literature Recommendations
        </Button>
      </div>

      {tab === "export" ? (
        <ExportTab
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          filteredPapers={filteredPapers}
          selectedIds={selectedIds}
          togglePaper={togglePaper}
          selectAll={selectAll}
          clearAll={clearAll}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      ) : (
        <RecommendTab
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
        />
      )}
    </div>
  );
}

function ExportTab({
  projects, selectedProject, setSelectedProject,
  filteredPapers, selectedIds, togglePaper, selectAll, clearAll,
  searchQuery, setSearchQuery,
}: {
  projects: ResearchProject[];
  selectedProject: ID | null;
  setSelectedProject: (id: ID) => void;
  filteredPapers: PaperListItem[];
  selectedIds: Set<number>;
  togglePaper: (id: number) => void;
  selectAll: () => void;
  clearAll: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const [format, setFormat] = useState<CitationFormat>("APA");
  const [bibtex, setBibtex] = useState<string | null>(null);
  const [ris, setRis] = useState<string | null>(null);
  const [citations, setCitations] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (type: "bibtex" | "ris" | "citation") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      if (type === "bibtex") {
        const res = await exportBibtexBatch(ids);
        setBibtex(res.bibtex);
        setRis(null);
        setCitations(null);
      } else if (type === "ris") {
        const res = await exportRisBatch(ids);
        setRis(res.ris);
        setBibtex(null);
        setCitations(null);
      } else {
        const res = await getBibliography(ids, format);
        setCitations(res.citations);
        setBibtex(null);
        setRis(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">1. Select Papers</h2>
        <select
          value={selectedProject ?? ""}
          onChange={(e) => setSelectedProject(Number(e.target.value))}
          className="mb-3 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search papers..."
          className="mb-2 h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
        />

        <div className="flex items-center gap-2 mb-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All ({filteredPapers.length})
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll}>
            Clear
          </Button>
          <span className="text-xs text-gray-500">
            {selectedIds.size} selected
          </span>
        </div>

        <div className="max-h-60 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
          {filteredPapers.length === 0 ? (
            <p className="text-sm text-gray-400">No papers found</p>
          ) : (
            filteredPapers.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => togglePaper(p.id)}
                />
                <span className="truncate text-sm text-gray-700">{p.title}</span>
              </label>
            ))
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">2. Export</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as CitationFormat)}
            className="h-9 rounded-md border border-gray-300 px-2 text-sm"
          >
            <option value="APA">APA 7th</option>
            <option value="MLA">MLA 9th</option>
            <option value="GB_7714">GB/T 7714</option>
          </select>
          <Button
            variant="outline"
            onClick={() => handleExport("citation")}
            disabled={selectedIds.size === 0 || loading}
          >
            {loading ? "..." : "Generate Citations"}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport("bibtex")}
            disabled={selectedIds.size === 0 || loading}
          >
            {loading ? "..." : "Copy BibTeX"}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport("ris")}
            disabled={selectedIds.size === 0 || loading}
          >
            {loading ? "..." : "Copy RIS"}
          </Button>
          {bibtex && (
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(bibtex)}>
              Copy to Clipboard
            </Button>
          )}
          {ris && (
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(ris)}>
              Copy to Clipboard
            </Button>
          )}
          {citations && (
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(citations.join("\n\n"))}>
              Copy to Clipboard
            </Button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {bibtex && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-gray-900">BibTeX</h2>
          <pre className="max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            {bibtex}
          </pre>
        </Card>
      )}
      {ris && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-gray-900">RIS</h2>
          <pre className="max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            {ris}
          </pre>
        </Card>
      )}
      {citations && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-gray-900">Citations ({format})</h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            {citations.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </Card>
      )}
    </div>
  );
}

function RecommendTab({
  projects, selectedProject, setSelectedProject,
}: {
  projects: ResearchProject[];
  selectedProject: ID | null;
  setSelectedProject: (id: ID) => void;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<RecommendResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecommend = async () => {
    if (!text.trim() || text.length < 10 || !selectedProject) return;
    setLoading(true);
    setError(null);
    try {
      const res = await recommendPapers(Number(selectedProject), text);
      setResults(res.results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">Project</h2>
        <select
          value={selectedProject ?? ""}
          onChange={(e) => setSelectedProject(Number(e.target.value))}
          className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">
          Paste a paragraph to find related literature
        </h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full rounded-md border border-gray-300 p-3 text-sm"
          placeholder="Paste a paragraph from your manuscript here to find supporting or contrasting papers from your library..."
        />
        <Button
          onClick={handleRecommend}
          disabled={loading || text.length < 10 || !selectedProject}
          className="mt-3"
        >
          {loading ? "Searching..." : "Find Related Literature"}
        </Button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {results && results.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-gray-900">
            Results ({results.length})
          </h2>
          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className="rounded border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    r.stance === 'supporting' ? 'bg-green-100 text-green-700' :
                    r.stance === 'contrasting' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {r.stance}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {r.paper_title || `Paper #${r.paper_id}`}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">
                    score: {r.score.toFixed(3)}
                  </span>
                </div>
                <p className="text-xs text-gray-700 line-clamp-3">{r.content}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
      {results && results.length === 0 && (
        <Card className="p-4 text-sm text-gray-500">
          No related papers found.
        </Card>
      )}
    </div>
  );
}