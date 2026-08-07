/**
 * Writing 页面：Literature Review Assistant（F7）+ Writing Assistant（Agent 4）。
 *
 * - Tab 1: Review Generator——选论文 + Topic 生成综述（异步任务）
 * - Tab 2: Writing Assistant——改写/润色/回复审稿人/Cover letter（同步）
 */
"use client";

import { useEffect, useState } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { generateReview, pollReviewTask } from "@/lib/api/reviews";
import { transformText } from "@/lib/api/writing";
import { Card, Button, Input, Textarea, Spinner } from "@/components/ui";
import type {
  ID,
  PaperListItem,
  ResearchProject,
  WritingAction,
} from "@/types";

const WRITING_ACTIONS: { value: WritingAction; label: string }[] = [
  { value: "rewrite", label: "Rewrite（改写）" },
  { value: "polish", label: "Polish（润色）" },
  { value: "review_response", label: "Reply to Reviewers（回复审稿人）" },
  { value: "cover_letter", label: "Cover Letter" },
];

export default function WritingPage() {
  const [tab, setTab] = useState<"review" | "assistant">("review");

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
      </div>

      {tab === "review" ? <ReviewGenerator /> : <WritingAssistant />}
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

// ===== Tab 2: Writing Assistant（Agent 4） =====
function WritingAssistant() {
  const [action, setAction] = useState<WritingAction>("polish");
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [transforming, setTransforming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTransform = async () => {
    if (!text.trim()) return;
    setTransforming(true);
    setError(null);
    setResult("");
    try {
      const { result: out } = await transformText({ text, action });
      setResult(out);
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
          {transforming ? "Transforming..." : "Transform"}
        </Button>
      </Card>

      {error && (
        <Card className="p-4 text-sm text-red-600">{error}</Card>
      )}

      {result && (
        <Card className="p-6">
          <h2 className="mb-3 font-semibold text-gray-900">Result</h2>
          <div className="whitespace-pre-wrap text-gray-800">{result}</div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => navigator.clipboard.writeText(result)}
          >
            Copy
          </Button>
        </Card>
      )}
    </div>
  );
}
