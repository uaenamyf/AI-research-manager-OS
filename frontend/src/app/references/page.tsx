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
  // Writing Assistant only

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

<WritingAssistantTab />
    </div>
  );
}

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