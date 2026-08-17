/**
 * Writing 页面：Overleaf 风格写作工作区（Markdown / LaTeX 双模式）。
 *
 * - 左侧栏：选论文 → 插入引用/参考文献（主要）+ 生成综述（次要）
 * - 主区域：Markdown 编辑器（Compile 渲染预览）或 LaTeX 编辑器（Compile 出 PDF）
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { generateReview, pollReviewTask } from "@/lib/api/reviews";
import { exportBibtexBatch } from "@/lib/api/export";
import { apiFetchRaw } from "@/lib/api/client";
import {
  listManuscripts,
  createManuscript,
  updateManuscript,
  deleteManuscript,
} from "@/lib/api/manuscripts";
import type { Manuscript } from "@/lib/api/manuscripts";
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
  const [showReview, setShowReview] = useState(false);
  const [reviewResult, setReviewResult] = useState<string>("");
  const [showReviewModal, setShowReviewModal] = useState(false);

  // 编辑器状态
  const [mode, setMode] = useState<"markdown" | "latex">("markdown");
  const [mdDoc, setMdDoc] = useState<string>(
    "# Untitled\n\nStart writing your manuscript here...\n",
  );
  const [texDoc, setTexDoc] = useState<string>(LATEX_TEMPLATE);
  const [mdCompiled, setMdCompiled] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [citeMsg, setCiteMsg] = useState<string | null>(null);
  const [bibContent, setBibContent] = useState<string>("");

  // 手稿状态
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [currentManuscriptId, setCurrentManuscriptId] = useState<number | null>(null);
  const [manuscriptTitle, setManuscriptTitle] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showNewInput, setShowNewInput] = useState(false);

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
    setSelectedPaperIds([]);
  }, [selectedProject]);

  const togglePaper = (id: ID) => {
    setSelectedPaperIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  /** 从 BibTeX 中提取 citation key（如 @article{Bermant2019, ...} → Bermant2019） */
  const extractKeys = (bibtex: string): string[] => {
    const keys: string[] = [];
    const re = /@\w+\{([^,]+),/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bibtex)) !== null) {
      keys.push(m[1].trim());
    }
    return keys;
  };

  /** 在当前光标位置插入文本 */
  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const current = mode === "latex" ? texDoc : mdDoc;
      const next = current.slice(0, start) + text + current.slice(end);
      if (mode === "latex") setTexDoc(next);
      else setMdDoc(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + text.length;
      });
    } else {
      if (mode === "latex") setTexDoc((prev) => prev + text);
      else setMdDoc((prev) => prev + text);
    }
  };

  /** 插入引用：LaTeX 模式 \cite{key1,key2}，Markdown 模式 [@id1][@id2] */
  const handleInsertCitation = async () => {
    if (selectedPaperIds.length === 0) {
      setCiteMsg("Select papers first");
      return;
    }
    try {
      const res = await exportBibtexBatch(selectedPaperIds);
      const keys = extractKeys(res.bibtex);
      if (keys.length === 0) {
        setCiteMsg("No citation keys found");
        return;
      }
      if (mode === "latex") {
        insertAtCursor(`\\cite{${keys.join(",")}}`);
        // 积累 BibTeX 条目，供 \bibliography{references} 使用
        setBibContent((prev) => prev + (prev ? "\n" : "") + res.bibtex);
        // 若正文还没有 \bibliography 段，自动追加（确保编译能解析引用）
        if (!texDoc.includes("\\bibliography")) {
          setTexDoc((prev) =>
            prev.replace(
              /\\end\{document\}/,
              "\\bibliographystyle{apalike}\n\\bibliography{references}\n\\end{document}",
            ),
          );
        }
      } else {
        insertAtCursor(keys.map((k) => `[@${k}]`).join(" "));
      }
      setCiteMsg(`Inserted ${keys.length} citation(s)`);
      // 引用完成后自动取消勾选，方便继续选下一篇
      setSelectedPaperIds([]);
    } catch (err) {
      setCiteMsg((err as Error).message);
    }
  };

  /** 插入参考文献：LaTeX 模式追加 \\bibliography 段，Markdown 模式追加 References 段 */
  const handleInsertBibliography = async () => {
    if (selectedPaperIds.length === 0) {
      setCiteMsg("Select papers first");
      return;
    }
    try {
      const res = await exportBibtexBatch(selectedPaperIds);
      if (mode === "latex") {
        // 用 \bibliography{references} 引用 .bib 文件（编译时 bibtex 解析）
        setBibContent((prev) => prev + (prev ? "\n" : "") + res.bibtex);
        const section = "\n\\bibliographystyle{apalike}\n\\bibliography{references}\n";
        insertAtCursor(section);
      } else {
        const section =
          "\n\n## References\n\n" +
          res.bibtex
            .split("\n\n")
            .filter(Boolean)
            .map((entry) => {
              const titleMatch = /title\s*=\s*\{([^}]+)\}/.exec(entry);
              const title = titleMatch ? titleMatch[1] : "Untitled";
              return `- ${title}`;
            })
            .join("\n") +
          "\n";
        insertAtCursor(section);
      }
      setCiteMsg("Bibliography inserted");
    } catch (err) {
      setCiteMsg((err as Error).message);
    }
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
      setReviewResult(review);
      setShowReviewModal(true);
      setStatus("Review generated");
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
        body: JSON.stringify({ tex: texDoc, bib: bibContent }),
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

  const switchMode = (m: "markdown" | "latex") => {
    setMode(m);
    setMdCompiled(null);
    setPdfUrl(null);
  };

  // 加载手稿列表
  useEffect(() => {
    listManuscripts().then(setManuscripts).catch(() => {});
  }, []);

  const loadManuscript = (m: Manuscript) => {
    setCurrentManuscriptId(m.id);
    setManuscriptTitle(m.title);
    setMode(m.format === "markdown" ? "markdown" : "latex");
    if (m.format === "markdown") setMdDoc(m.content);
    else setTexDoc(m.content || LATEX_TEMPLATE);
    setMdCompiled(null);
    setPdfUrl(null);
    setBibContent("");
  };

  const saveManuscript = async () => {
    setSaving(true);
    try {
      const content = mode === "latex" ? texDoc : mdDoc;
      const title = manuscriptTitle.trim() || "Untitled";
      if (currentManuscriptId) {
        const updated = await updateManuscript(currentManuscriptId, {
          title,
          format: mode,
          content,
          projectId: selectedProject,
        });
        setManuscripts((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m)),
        );
        setCiteMsg("Saved");
      } else {
        const created = await createManuscript({
          title,
          format: mode,
          content,
          projectId: selectedProject,
        });
        setCurrentManuscriptId(created.id);
        setManuscripts((prev) => [created, ...prev]);
        setCiteMsg("Saved as new manuscript");
      }
    } catch (err) {
      setCiteMsg("Save failed: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const newManuscript = async (name?: string) => {
    const title = name?.trim() || "Untitled";
    setCurrentManuscriptId(null);
    setManuscriptTitle(title);
    setBibContent("");
    const content =
      mode === "latex" ? LATEX_TEMPLATE : "# Untitled\n\nStart writing your manuscript here...\n";
    if (mode === "latex") setTexDoc(content);
    else setMdDoc(content);
    setMdCompiled(null);
    setPdfUrl(null);
    setShowNewInput(false);
    // 立即创建并保存手稿（出现在列表，Save 变为更新）
    try {
      const created = await createManuscript({
        title,
        format: mode,
        content,
        projectId: selectedProject,
      });
      setCurrentManuscriptId(created.id);
      setManuscripts((prev) => [created, ...prev]);
      setCiteMsg(`Created "${title}"`);
    } catch (err) {
      setCiteMsg("Create failed: " + (err as Error).message);
    }
  };

  const handleDeleteManuscript = async (id: number) => {
    if (!confirm("Delete this manuscript?")) return;
    await deleteManuscript(id);
    setManuscripts((prev) => prev.filter((m) => m.id !== id));
    if (currentManuscriptId === id) {
      // 删除当前手稿后清空编辑器（不新建）
      setCurrentManuscriptId(null);
      setManuscriptTitle("");
      setBibContent("");
      if (mode === "latex") setTexDoc(LATEX_TEMPLATE);
      else setMdDoc("# Untitled\n\nStart writing your manuscript here...\n");
      setMdCompiled(null);
      setPdfUrl(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-4">
      {/* 左侧栏：论文选择 + 引用/综述 */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3">
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Manuscripts</h2>
            <button
              onClick={() => setShowNewInput(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              + New
            </button>
          </div>
          {showNewInput && (
            <div className="mb-2 flex gap-1">
              <input
                value={manuscriptTitle}
                onChange={(e) => setManuscriptTitle(e.target.value)}
                placeholder="Document name"
                className="h-9 flex-1 rounded border border-gray-300 px-2 text-sm"
                autoFocus
              />
              <button
                onClick={() => newManuscript(manuscriptTitle)}
                className="h-9 px-3 text-sm bg-gray-900 text-white rounded"
              >
                Add
              </button>
            </div>
          )}
          <div className="max-h-28 overflow-y-auto space-y-0.5">
            {manuscripts.length === 0 ? (
              <p className="text-xs text-gray-400">No saved manuscripts</p>
            ) : (
              manuscripts.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-sm cursor-pointer ${
                    currentManuscriptId === m.id ? "bg-gray-100" : "hover:bg-gray-50"
                  }`}
                  onClick={() => loadManuscript(m)}
                >
                  <span className="truncate flex-1">{m.title}</span>
                  <span className="text-[10px] text-gray-400">{m.format}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteManuscript(m.id);
                    }}
                    className="text-gray-300 hover:text-red-600 text-xs"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>

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
          <div className="mt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleInsertCitation}
              disabled={selectedPaperIds.length === 0}
            >
              Citation
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleInsertBibliography}
              disabled={selectedPaperIds.length === 0}
            >
              Bibliography
            </Button>
          </div>
          {citeMsg && <p className="mt-1 text-xs text-blue-600">{citeMsg}</p>}
          <button
            onClick={() => setShowReview(!showReview)}
            className="mt-2 flex w-full items-center justify-between text-sm font-semibold text-gray-900"
          >
            <span>Generate Review</span>
            <span className="text-gray-400">{showReview ? "−" : "+"}</span>
          </button>
          {showReview && (
            <div className="mt-2">
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
              {status && <p className="mt-1 text-xs text-blue-600">{status}</p>}
            </div>
          )}
        </Card>

        {error && <p className="text-xs text-red-600 px-1">{error}</p>}
      </div>

      {/* 主区域：编辑器 + 编译预览 */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {currentManuscriptId && (
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
              <Button variant="outline" size="sm" onClick={handleCompileMarkdown}>
                Compile
              </Button>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const content = mode === "latex" ? texDoc : mdDoc;
                const ext = mode === "latex" ? "tex" : "md";
                const blob = new Blob([content], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${manuscriptTitle || "manuscript"}.${ext}`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={saveManuscript}
              disabled={saving || !currentManuscriptId}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        )}

        {/* 编辑器 + 预览：左右分栏 */}
        <div className="flex-1 flex gap-3 min-h-0">
          {!currentManuscriptId ? (
            <div className="flex flex-1 items-center justify-center text-gray-400">
              Select a manuscript on the left to start writing, or click + New to create one.
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0 flex flex-col">
                <Card className="flex-1 p-0 min-h-0 flex flex-col">
                  {mode === "markdown" ? (
                    <textarea
                      ref={textareaRef}
                      value={mdDoc}
                      onChange={(e) => setMdDoc(e.target.value)}
                      className="flex-1 w-full resize-none rounded border-0 p-4 font-mono text-sm focus:outline-none"
                      placeholder="Write your manuscript in Markdown..."
                    />
                  ) : (
                    <textarea
                      ref={textareaRef}
                      value={texDoc}
                      onChange={(e) => setTexDoc(e.target.value)}
                      className="flex-1 w-full resize-none rounded border-0 p-4 font-mono text-sm focus:outline-none"
                      placeholder="Write your LaTeX document..."
                    />
                  )}
                </Card>
              </div>

              {(mode === "markdown" ? mdCompiled !== null : pdfUrl !== null) && (
                <div className="flex-1 min-w-0 flex flex-col border-l border-gray-200 pl-3">
                  {mode === "markdown" ? (
                    <Card className="flex-1 p-4 min-h-0 overflow-y-auto">
                      <div
                        className="prose prose-sm max-w-none text-gray-800"
                        dangerouslySetInnerHTML={{ __html: mdCompiled || "" }}
                      />
                    </Card>
                  ) : (
                    <Card className="flex-1 p-0 min-h-0 overflow-hidden">
                      {pdfUrl && (
                        <iframe src={pdfUrl} className="h-full w-full border-0" title="Compiled PDF" />
                      )}
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>

      {/* Review 生成结果弹窗 */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="font-semibold text-gray-900">Generated Review</h2>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {reviewResult}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReviewModal(false)}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(reviewResult);
                  setShowReviewModal(false);
                }}
              >
                Copy & Close
              </Button>
            </div>
          </div>
        </div>
      )}
  );
}