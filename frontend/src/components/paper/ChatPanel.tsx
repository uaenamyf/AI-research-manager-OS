/** Paper Chat 面板：流式问答 + 引用展示。 */
"use client";

import { useState } from "react";
import { useChatStream } from "@/lib/hooks/useChatStream";
import type { ID } from "@/types";

export function ChatPanel({ paperId }: { paperId: ID }) {
  const [question, setQuestion] = useState("");
  const [citations, setCitations] = useState<ID[]>([]);
  const { answer, streaming, error, send, stop } = useChatStream({
    paperId,
    onCitations: setCitations,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || streaming) return;
    send(question.trim());
    setQuestion("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="font-semibold text-gray-900">AI Assistant</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {answer && (
          <div className="prose prose-sm max-w-none">
            <p className="whitespace-pre-wrap text-gray-800">{answer}</p>
            {citations.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                Citations: {citations.join(", ")}
              </p>
            )}
          </div>
        )}
        {error && (
          <p className="text-sm text-red-600">Error: {error.message}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3">
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this paper..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-md bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
