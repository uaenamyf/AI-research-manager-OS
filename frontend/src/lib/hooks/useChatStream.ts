/** 流式 Paper Chat hook。 */
"use client";

import { useCallback, useRef, useState } from "react";
import { streamPaperChat } from "@/lib/api/chat";
import type { ID } from "@/types";

interface UseChatStreamOptions {
  paperId: ID;
  onCitations?: (citations: ID[]) => void;
  onDone?: () => void;
}

/** 管理流式聊天的状态与取消 */
export function useChatStream({
  paperId,
  onCitations,
  onDone,
}: UseChatStreamOptions) {
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const send = useCallback(
    (question: string) => {
      setAnswer("");
      setError(null);
      setStreaming(true);

      controllerRef.current = streamPaperChat(
        paperId,
        question,
        (token) => setAnswer((prev) => prev + token),
        onCitations,
        (err) => {
          setError(err);
          setStreaming(false);
        },
        onDone,
      );
    },
    [paperId, onCitations, onDone],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    setStreaming(false);
  }, []);

  return { answer, streaming, error, send, stop };
}
