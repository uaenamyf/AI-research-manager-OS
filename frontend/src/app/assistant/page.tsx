/** Writing Assistant：科研文本改写 / 润色 / 审稿回复（Agent 4）。 */
"use client";

import { useState } from "react";
import { rewriteText } from "@/lib/api/writing";
import { Card, Button, Textarea, Spinner } from "@/components/ui";
import type { WritingAction } from "@/types";

const ACTIONS: { value: WritingAction; label: string; needsInstruction?: boolean }[] = [
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

export default function AssistantPage() {
  const [text, setText] = useState("");
  const [action, setAction] = useState<WritingAction>("polish");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = ACTIONS.find((a) => a.value === action);

  const handleRewrite = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult("");
    try {
      const res = await rewriteText({ text, action, instruction });
      setResult(res.text);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) navigator.clipboard.writeText(result);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Writing Assistant</h1>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">1. Choose Action</h2>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
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
        <h2 className="mb-3 font-semibold text-gray-900">2. Your Text</h2>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your draft, paragraph, or manuscript text here..."
          rows={8}
        />
        <Button
          onClick={handleRewrite}
          disabled={loading || !text.trim()}
          className="mt-3"
        >
          {loading ? "Working..." : "Rewrite"}
        </Button>
      </Card>

      {loading && (
        <Card className="flex items-center gap-2 p-4 text-sm text-blue-600">
          <Spinner /> Rewriting your text...
        </Card>
      )}

      {error && <Card className="p-4 text-sm text-red-600">{error}</Card>}

      {result && (
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Result</h2>
            <Button variant="outline" size="sm" onClick={handleCopy}>
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
