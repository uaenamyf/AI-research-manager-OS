/**
 * Writing 页面：Literature Review Assistant（F7）+ Writing Assistant（Agent 4）。
 *
 * - Tab 1: Review Generator——选论文 + Topic 生成综述（异步任务）
 * - Tab 2: Writing Assistant——改写/润色/翻译/审稿回复/Cover letter（同步）
 */
"use client";

import { useEffect, useState } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { generateReview, pollReviewTask } from "@/lib/api/reviews";
import { rewriteText } from "@/lib/api/writing";
import { searchLiterature } from "@/lib/api/literature";
import { Card, Button, Input, Textarea, Spinner } from "@/components/ui";
import type {
  ID,
  LiteratureResult,
  LiteratureSearchResponse,
  PaperListItem,
  ResearchProject,
  WritingAction,
} from "@/types";

const WRITING_ACTIONS: {
  value: WritingAction;
  label: string;
  needsInstruction?: boolean;
}[] = [
  { value: "polish", label: "Polish" },
  { value: "expand", label: "Expand" },
  { value: "shorten", label: "Shorten" },
  { value: "translate", label: "Translate", needsInstruction: true },
  { value: "rebuttal", label: "Reviewer Rebuttal", needsInstruction: true },
  { value: "cover_letter", label: "Cover Letter" },
];

const INSTRUCTION_PLACEHOLDER: Partial<Record<WritingAction, string>> = {
  translate: "Target language, e.g. Chinese",
  rebuttal: "Paste the reviewer comments here",
};

export default function WritingPage() {
  const [tab, setTab] = useState<"review" | "assistant" | "search">("review");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Writing Studio</h1>

      <div className="flex gap-2">
        <Button
          variant={tab === "review" ? "default" : "outline"}
          onClick={() => setTab("review")}
        >
          Literature Review
        </Button>
        <Button
          variant={tab === "assistant" ? "default" : "outline"}
          onClick={() => setTab("assistant")}
        >
          Writing Assistant
        </Button>
        <Button
          variant={tab === "search" ? "default" : "outline"}
          onClick={() => setTab("search")}
        >
          Literature Search
        </Button>
      </div>

      {tab === "review" ? (
        <ReviewGenerator />
      ) : tab === "assistant" ? (
        <WritingAssistant />
      ) : (
        <LiteratureSearch />
      )}
    </div>
  );
}

// ===== Tab 1: Literature Review Generator（F7） =====
function ReviewGenerator() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ID | null>(null);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<ID[]>([]);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [review, setReview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    listProjects(0, 50).then((p) => {
      setProjects(p.items);
      if (p.items[0]) setSelectedProject(p.items[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    // date: 2026-08-07
    // dev: myf
    // changelog: 修复 listPapers 参数错位（folderId 误传 0、page 误传 200 导致论文列表为空）
    listPapers(selectedProject, undefined, 0, 200).then((p) => setPapers(p.items));
    setSelectedPaperIds([]);
  }, [selectedProject]);

  const togglePaper = (id: ID) => {
    setSelectedPaperIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    if (selectedPaperIds.length === 0 || !topic.trim()) return;
    setGenerating(true);
    setError(null);
    setReview("");
    setStatus("Submitting...");
    try {
      const { taskId } = await generateReview({
        paperIds: selectedPaperIds,
        topic,
      });
      setStatus("Processing...");
      const task = await pollReviewTask(taskId, 2000, (t) =>
        setStatus(t.status),
      );
      setReview(task.result?.markdown ?? "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
      setStatus("");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Literature Review Assistant
      </h1>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">1. Select Project</h2>
        <select
          value={selectedProject ?? ""}
          onChange={(e) => setSelectedProject(Number(e.target.value))}
          className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">
          2. Select Papers ({selectedPaperIds.length} selected)
        </h2>
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {papers.map((paper) => (
            <label
              key={paper.id}
              className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedPaperIds.includes(paper.id)}
                onChange={() => togglePaper(paper.id)}
              />
              <span className="text-sm text-gray-700">{paper.title}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">3. Enter Topic</h2>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Deep learning based classification methods"
        />
        <Button
          onClick={handleGenerate}
          disabled={generating || selectedPaperIds.length === 0 || !topic.trim()}
          className="mt-3"
        >
          {generating ? "Generating..." : "Generate Review"}
        </Button>
      </Card>

      {(generating || status) && (
        <Card className="flex items-center gap-2 p-4 text-sm text-blue-600">
          {generating && <Spinner />} {status}
        </Card>
      )}

      {error && (
        <Card className="p-4 text-sm text-red-600">{error}</Card>
      )}

      {review && (
        <Card className="p-6">
          <h2 className="mb-3 font-semibold text-gray-900">
            Generated Review
          </h2>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
            {review}
          </div>
        </Card>
      )}
    </div>
  );
}

// 2026-08-07 myf: 将 /assistant 页完整版 Writing Assistant 并入 Tab 2，
// 统一走 /api/writing/rewrite（支持 instruction），删除旧 transform 精简版
// ===== Tab 2: Writing Assistant（Agent 4） =====
function WritingAssistant() {
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
            placeholder={INSTRUCTION_PLACEHOLDER[action] ?? ""}
            className="mt-3 h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-gray-900 focus:outline-none"
          />
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">2. Paste Your Text</h2>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Paste the manuscript paragraph, reviewer comment, or draft text here..."
          className="w-full rounded-md border border-gray-300 p-3 text-sm"
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

// 2026-08-12 myf: 新增 Tab 3 Literature Search —— 经 literature-search-mcp
// （PubMed/Europe PMC/bioRxiv/Crossref/OpenAlex/Semantic Scholar/arXiv 七库融合检索）
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

// ===== Tab 3: Literature Search（MCP 学术检索） =====
function LiteratureSearch() {
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
