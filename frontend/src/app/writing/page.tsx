/**
 * Writing 页面：Literature Review Assistant（F7）+ Writing Assistant（Agent 4）
 * + 写作引用与参考文献（Phase 2）。
 *
 * - Tab 1: Review Generator——选论文 + Topic 生成综述（异步任务）
 * - Tab 2: Writing Assistant——改写/润色/翻译/审稿回复/Cover letter（同步）
 * - Tab 3: Write with Citations——引用插入 + 参考文献生成（Phase 2）
 *
 * 注：原 Tab 3 Literature Search 已剥离为独立页面 /literature。
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers, getPaper } from "@/lib/api/papers";
import { generateReview, pollReviewTask } from "@/lib/api/reviews";
import { rewriteText } from "@/lib/api/writing";
import { getCitation, getBibliography } from "@/lib/api/citation";
import type { CitationFormat } from "@/lib/api/citation";
import { Card, Button, Input, Textarea, Spinner } from "@/components/ui";
import type {
  ID,
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
  const [tab, setTab] = useState<"review" | "assistant" | "citations">("review");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Writing Studio</h1>

      <div className="flex gap-2 flex-wrap">
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
          variant={tab === "citations" ? "default" : "outline"}
          onClick={() => setTab("citations")}
        >
          Write with Citations
        </Button>
      </div>

      {tab === "review" && <ReviewGenerator />}
      {tab === "assistant" && <WritingAssistant />}
      {tab === "citations" && <WriteWithCitations />}
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
    // date: 2026-08-13
    // dev: myf
    // changelog: folderId 传 -1 查全部文件夹论文（原 undefined 走根目录导致 Review 选不到子文件夹中的论文）
    listPapers(selectedProject, -1, 0, 200).then((p) => setPapers(p.items));
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

// ────────────────────────────────────────────────────────────────
// 2026-08-15 myf: Phase 2 写作引用与参考文献——Tab 3
// ────────────────────────────────────────────────────────────────
function WriteWithCitations() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ID | null>(null);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [text, setText] = useState("");
  const [insertedIds, setInsertedIds] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<CitationFormat>("APA");
  const [bibliography, setBibliography] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listProjects(0, 50).then((p) => {
      setProjects(p.items);
      if (p.items[0]) setSelectedProject(p.items[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    listPapers(selectedProject, -1, 0, 200).then((p) => setPapers(p.items));
  }, [selectedProject]);

  const filteredPapers = papers.filter(
    (p) =>
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const insertCitation = useCallback(
    (paperId: number) => {
      const marker = `[@${paperId}]`;
      setInsertedIds((prev) => new Set(prev).add(paperId));
      const ta = textareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newText = text.slice(0, start) + marker + text.slice(end);
        setText(newText);
        // 光标移到 marker 后
        requestAnimationFrame(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + marker.length;
        });
      } else {
        setText((prev) => prev + marker);
      }
    },
    [text],
  );

  const handleGenerateBibliography = async () => {
    if (insertedIds.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getBibliography(Array.from(insertedIds), format);
      setBibliography(res.citations);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 替换文本中的 [@id] 为 (Author, Year) 内联引用
  const replaceInlineCitations = (
    txt: string,
    citations: string[],
  ): string => {
    let result = txt;
    const ids = Array.from(insertedIds);
    ids.forEach((id, idx) => {
      const citation = citations[idx] || `[${id}]`;
      // 取 APA 格式的 "(Author, Year)" 部分
      const inline = citation.split("(")[0]?.trim() || citation;
      result = result.replace(`[@${id}]`, `(${inline})`);
    });
    return result;
  };

  const [preview, setPreview] = useState<string | null>(null);
  const showPreview = () => {
    if (!bibliography) return;
    setPreview(replaceInlineCitations(text, bibliography));
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">
          1. Select Project & Papers
        </h2>
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

        <Input
          placeholder="Search papers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mt-3"
        />

        <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
          {filteredPapers.length === 0 ? (
            <p className="text-sm text-gray-400">No papers found</p>
          ) : (
            filteredPapers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded px-2 py-1 hover:bg-gray-50"
              >
                <span className="truncate text-sm text-gray-700">
                  {p.title}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 shrink-0 text-xs"
                  onClick={() => insertCitation(p.id)}
                >
                  + Cite
                </Button>
              </div>
            ))
          )}
        </div>
        {insertedIds.size > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            {insertedIds.size} paper(s) cited
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">
          2. Write Your Text
        </h2>
        <p className="mb-2 text-xs text-gray-500">
          Click <strong>+ Cite</strong> on a paper to insert{' '}
          <code>[@paperId]</code> at cursor position. Then generate
          bibliography below.
        </p>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="w-full rounded-md border border-gray-300 p-3 text-sm focus:border-gray-900 focus:outline-none"
          placeholder="Start writing your manuscript here... Click +Cite to insert citations."
        />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">
          3. Generate Bibliography
        </h2>
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
            onClick={handleGenerateBibliography}
            disabled={insertedIds.size === 0 || loading}
          >
            {loading ? "Generating..." : "Generate Bibliography"}
          </Button>
          {bibliography && (
            <>
              <Button variant="outline" onClick={showPreview}>
                Preview with Citations
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard.writeText(bibliography.join("\n\n"))
                }
              >
                Copy Bibliography
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard.writeText(
                    replaceInlineCitations(text, bibliography) +
                      "\n\nReferences\n" +
                      bibliography.join("\n"),
                  )
                }
              >
                Copy All
              </Button>
            </>
          )}
        </div>
      </Card>

      {error && (
        <Card className="p-4 text-sm text-red-600">{error}</Card>
      )}

      {bibliography && !preview && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-gray-900">
            References ({format})
          </h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            {bibliography.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </Card>
      )}

      {preview && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-gray-900">Preview</h2>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
            {preview}
          </div>
          <h3 className="mt-6 mb-2 font-semibold text-gray-900">
            References
          </h3>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            {bibliography!.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
