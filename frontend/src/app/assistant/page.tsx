/**
 * Assistant 页面：Writing Assistant（Agent 4）。
 *
 * 文本改写/润色/扩写/缩写/翻译/回复审稿人/Cover letter 工具。
 * 2026-08-14: 原 /references 路由的文献推荐与 Export 功能已移除，页面只剩
 * Writing Assistant，路由与目录由 /references 改为 /assistant，避免与
 * /writing（Write 手稿编辑器）在侧边栏产生 Write/Writing 重复。
 */
"use client";

import { useState } from "react";
import type { WritingAction } from "@/types";
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

export default function AssistantPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Writing Assistant</h1>
      <WritingAssistantPanel />
    </div>
  );
}

function WritingAssistantPanel() {
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
        {current?.value === "translate" && (
          <select
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="mt-3 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
          >
            <option value="">Select target language...</option>
            <option value="Chinese">Chinese</option>
            <option value="English">English</option>
            <option value="Japanese">Japanese</option>
            <option value="Korean">Korean</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Spanish">Spanish</option>
            <option value="Portuguese">Portuguese</option>
            <option value="Russian">Russian</option>
            <option value="Arabic">Arabic</option>
          </select>
        )}
        {current?.value === "rebuttal" && (
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Paste the reviewer comments here"
            rows={4}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 text-sm"
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
