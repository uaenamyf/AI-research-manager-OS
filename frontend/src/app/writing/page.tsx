/**
 * Writing 页面：Overleaf 风格写作工作区（Markdown / LaTeX 双模式）。
 *
 * - 左侧栏：选论文 + 生成综述，可一键插入正文
 * - 主区域：Markdown 编辑器（Compile 渲染预览）或 LaTeX 编辑器（Compile 出 PDF）
 */
"use client";

import { useEffect, useState } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { generateReview, pollReviewTask } from "@/lib/api/reviews";
import { apiFetchRaw } from "@/lib/api/client";
import { renderMarkdown } from "@/lib/utils/markdown";
import { Card, Button, Spinner } from "@/components/ui";
import type { ID, PaperListItem, ResearchProject } from "@/types";

const LATEX_TEMPLATE = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath, amssymb}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}

\\title{Untitled}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Write your introduction here.

\\end{document}
`;

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
  const [mode, setMode] = useState<"markdown" | "latex">("markdown");
  const [mdDoc, setMdDoc] = useState<string>(
    "# Untitled\n\nStart writing your manuscript here...\n",
  );
  const [texDoc, setTexDoc] = useState<string>(LATEX_TEMPLATE);
  const [mdCompiled, setMdCompiled] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);

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
      if (mode === "latex") {
        setTexDoc((prev) =>
          prev.replace(/\\end\{document\}/,
            "\\section{Literature Review: " + topic.replace(/[^a-zA-Z0-9 ]/g, "") + "}\n\n" +
            review + "\n\n\\end{document}"),
        );
      } else {
        setMdDoc((prev) => prev + "\n\n## Literature Review: " + topic + "\n\n" + review + "\n");
      }
      setStatus("Review inserted into editor");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCompileMarkdown = () => {
    setMdCompiled(renderMarkdown(mdDoc));
  };

  const handleCompileLatex = async () => {
    setCompiling(true);
    setError(null);
    try {
      const res = await apiFetchRaw("/api/writing/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tex: texDoc }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setError(errText || "LaTeX compilation failed");
        return;
      }
      const blob = await res.blob();
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCompiling(false);
    }
  };

  const handleDownload = () => {
    const content = mode === "latex" ? texDoc : mdDoc;
    const ext = mode === "latex" ? "tex" : "md";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manuscript.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const switchMode = (m: "markdown" | "latex") => {
    setMode(m);
    setMdCompiled(null);
    setPdfUrl(null);
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
          {status && <p className="mt-2 text-xs text-blue-600">{status}</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </Card>
      </div>

      {/* 主区域：编辑器 + 编译预览 */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant={mode === "markdown" ? "default" : "outline"}
              size="sm"
              onClick={() => switchMode("markdown")}
            >
              Markdown
            </Button>
            <Button
              variant={mode === "latex" ? "default" : "outline"}
              size="sm"
              onClick={() => switchMode("latex")}
            >
              LaTeX
            </Button>
          </div>
          <div className="flex gap-2">
            {mode === "markdown" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setMdCompiled(null)}>
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={handleCompileMarkdown}>
                  Compile
                </Button>
              </>
            )}
            {mode === "latex" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCompileLatex}
                disabled={compiling}
              >
                {compiling ? "Compiling..." : "Compile PDF"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDownload}>
              Download
            </Button>
          </div>
        </div>

        {mode === "markdown" &&
          (mdCompiled === null ? (
            <Card className="flex-1 p-0 min-h-0 flex flex-col">
              <textarea
                value={mdDoc}
                onChange={(e) => setMdDoc(e.target.value)}
                className="flex-1 w-full resize-none rounded border-0 p-4 font-mono text-sm focus:outline-none"
                placeholder="Write your manuscript in Markdown..."
              />
            </Card>
          ) : (
            <Card className="flex-1 p-6 min-h-0 overflow-y-auto">
              <div
                className="prose prose-sm max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: mdCompiled }}
              />
            </Card>
          ))}

        {mode === "latex" &&
          (pdfUrl ? (
            <Card className="flex-1 p-0 min-h-0 overflow-hidden">
              <iframe src={pdfUrl} className="h-full w-full border-0" title="Compiled PDF" />
            </Card>
          ) : (
            <Card className="flex-1 p-0 min-h-0 flex flex-col">
              <textarea
                value={texDoc}
                onChange={(e) => setTexDoc(e.target.value)}
                className="flex-1 w-full resize-none rounded border-0 p-4 font-mono text-sm focus:outline-none"
                placeholder="Write your LaTeX document..."
              />
            </Card>
          ))}
      </div>
    </div>
  );
}