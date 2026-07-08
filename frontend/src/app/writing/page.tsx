/** Review Generator：选论文 + 生成 Literature Review（F7）。 */
"use client";

import { useEffect, useState } from "react";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { generateReview, pollReviewTask } from "@/lib/api/reviews";
import { Card, Button, Input, Spinner } from "@/components/ui";
import type { ID, PaperListItem, ResearchProject } from "@/types";

export default function WritingPage() {
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
    listPapers(selectedProject, 0, 200).then((p) => setPapers(p.items));
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
