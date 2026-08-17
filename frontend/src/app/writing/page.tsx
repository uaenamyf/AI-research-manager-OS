/**
 * Writing 页面：Overleaf 风格写作工作区。
 *
 * - 左侧栏：选论文 + 生成综述（Review Generator 集成），可一键插入正文
 * - 主区域：Markdown 编辑器 + Compile 渲染预览
 */
"use client";

import { useEffect, useState } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { generateReview, pollReviewTask } from "@/lib/api/reviews";
import { renderMarkdown } from "@/lib/utils/markdown";
import { Card, Button, Spinner } from "@/components/ui";
import type { ID, PaperListItem, ResearchProject } from "@/types";

export default function WritingPage() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ID | null>(null);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<ID[]>([]);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 编辑器状态
  const [doc, setDoc] = useState<string>(
    "# Untitled\n\nStart writing your manuscript here...\n",
  );
  const [compiled, setCompiled] = useState<string | null>(null);

  useEffect(() => {
    listProjects(0, 50).then((p) => {
      setProjects(p.items);
      if (p.items[0]) setSelectedProject(p.items[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    listPapers(selectedProject, -1, 0, 200).then((p) => setPapers(p.items));
    setSelectedPaperIds([]);
  }, [selectedProject]);

  const togglePaper = (id: ID) => {
    setSelectedPaperIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleGenerateReview = async () => {
    if (selectedPaperIds.length === 0 || !topic.trim()) return;
    setGenerating(true);
    setError(null);
    setStatus("Submitting...");
    try {
      const { taskId } = await generateReview({
        paperIds: selectedPaperIds,
        topic,
      });
      setStatus("Generating...");
      const task = await pollReviewTask(taskId, 2000, (t) => setStatus(t.status));
      const review = task.result?.markdown ?? "";
      // 插入综述到正文（追加在末尾）
      setDoc((prev) => prev + "\n\n## Literature Review: " + topic + "\n\n" + review + "\n");
      setStatus("Review inserted into editor");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCompile = () => {
    setCompiled(renderMarkdown(doc));
  };

  const handleDownload = () => {
    const blob = new Blob([doc], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "manuscript.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-4">
      {/* 左侧栏：论文选择 + 综述生成 */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3">
        <Card className="p-3">
          <h2 className="mb-2 font-semibold text-gray-900 text-sm">Project</h2>
          <select
            value={selectedProject ?? ""}
            onChange={(e) => setSelectedProject(Number(e.target.value))}
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Card>

        <Card className="p-3 flex-1 flex flex-col min-h-0">
          <h2 className="mb-2 font-semibold text-gray-900 text-sm">
            Papers ({selectedPaperIds.length} selected)
          </h2>
          <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
            {papers.length === 0 ? (
              <p className="text-sm text-gray-400 pt-4 text-center">No papers</p>
            ) : (
              papers.map((paper) => (
                <label
                  key={paper.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedPaperIds.includes(paper.id)}
                    onChange={() => togglePaper(paper.id)}
                  />
                  <span className="truncate">{paper.title}</span>
                </label>
              ))
            )}
          </div>
        </Card>

        <Card className="p-3">
          <h2 className="mb-2 font-semibold text-gray-900 text-sm">
            Generate Literature Review
          </h2>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Deep learning for bioacoustics"
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
          <Button
            onClick={handleGenerateReview}
            disabled={generating || selectedPaperIds.length === 0 || !topic.trim()}
            className="mt-2 w-full"
          >
            {generating ? <Spinner /> : "Generate & Insert"}
          </Button>
          {status && (
            <p className="mt-2 text-xs text-blue-600">{status}</p>
          )}
          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}
        </Card>
      </div>

      {/* 主区域：编辑器 + 预览 */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Manuscript</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCompiled(null)}>
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={handleCompile}>
              Compile
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              Download .md
            </Button>
          </div>
        </div>

        {compiled === null ? (
          <Card className="flex-1 p-0 min-h-0 flex flex-col">
            <textarea
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              className="flex-1 w-full resize-none rounded border-0 p-4 font-mono text-sm focus:outline-none"
              placeholder="Write your manuscript in Markdown..."
            />
          </Card>
        ) : (
          <Card className="flex-1 p-6 min-h-0 overflow-y-auto">
            <div
              className="prose prose-sm max-w-none text-gray-800"
              dangerouslySetInnerHTML={{ __html: compiled }}
            />
          </Card>
        )}
      </div>
    </div>
  );
}