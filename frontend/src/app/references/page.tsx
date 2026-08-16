/**
 * Tools 页面：文献推荐 + Writing Assistant。
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import type { PaperListItem, ResearchProject, ID, WritingAction } from "@/types";
import { getCitation, getBibliography } from "@/lib/api/citation";
import type { CitationFormat } from "@/lib/api/citation";
import { recommendPapers } from "@/lib/api/papers";
import type { RecommendResult } from "@/lib/api/papers";
import { exportBibtexBatch, exportRisBatch } from "@/lib/api/export";
import { rewriteText } from "@/lib/api/writing";
import { Card, Button, Spinner } from "@/components/ui";

const WRITING_ACTIONS: { value: WritingAction; label: string; needsInstruction?: boolean }[] = [
  { value: "polish", label: "Polish" },
  { value: "expand", label: "Expand" },
  { value: "shorten", label: "Shorten" },
  { value: "translate", label: "Translate", needsInstruction: true },
  { value: "rebuttal", label: "Reviewer Rebuttal", needsInstruction: true },
  { value: "cover_letter", label: "Cover Letter" },
];

export default function ExportPage() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ID | null>(null);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"recommend" | "assistant">("recommend");

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
          variant={tab === "recommend" ? "default" : "outline"}
          onClick={() => setTab("recommend")}
        >
          Literature Recommendations
        </Button>
        <Button
          variant={tab === "assistant" ? "default" : "outline"}
          onClick={() => setTab("assistant")}
        >
          Writing Assistant
        </Button>
      </div>

{tab === "recommend" ? (
        <RecommendTab
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
        />
      ) : (
        <WritingAssistantTab />
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

// ────────────────────────────────────────────────────────────────
// Writing Assistant（从 /writing 迁移至此）
// ────────────────────────────────────────────────────────────────
function WritingAssistantTab() {
  const [action, setAction] = useState<WritingAction>("polish");
  const [text, setText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [transforming, setTransforming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = WRITING_ACTIONS.find((a) => a.value === action);

  const handleTransform = async () => {
    if (!text.trim()) return;
    setTransforming(true);
    setError(null);
    setResult("");
    try {
      const res = await rewriteText({ text, action, instruction });
      setResult(res.text);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTransforming(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">1. Choose Action</h2>
        <div className="flex flex-wrap gap-2">
          {WRITING_ACTIONS.map((a) => (
            <Button
              key={a.value}
              variant={action === a.value ? "default" : "outline"}
              size="sm"
              onClick={() => setAction(a.value)}
            >
              {a.label}
            </Button>
          ))}
        </div>
        {current?.needsInstruction && (
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={current.value === "translate" ? "Target language, e.g. Chinese" : "Paste the reviewer comments here"}
            className="mt-3 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
          />
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">2. Paste Your Text</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="w-full rounded-md border border-gray-300 p-3 text-sm"
          placeholder="Paste the manuscript paragraph, reviewer comment, or draft text here..."
        />
        <Button
          onClick={handleTransform}
          disabled={transforming || !text.trim()}
          className="mt-3"
        >
          {transforming ? "Working..." : "Rewrite"}
        </Button>
      </Card>

      {transforming && (
        <Card className="flex items-center gap-2 p-4 text-sm text-blue-600">
          <Spinner /> Rewriting your text...
        </Card>
      )}

      {error && (
        <Card className="p-4 text-sm text-red-600">{error}</Card>
      )}

      {result && (
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Result</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(result)}
            >
              Copy
            </Button>
          </div>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
            {result}
          </div>
        </Card>
      )}
    </div>
  );
}