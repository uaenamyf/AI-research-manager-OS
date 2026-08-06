/** Paper Chat API（F5），含 SSE 流式。 */
import { apiFetch } from "./client";
import type {
  ChatMessage,
  ChatRequest,
  ChatStreamEvent,
  ID,
} from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/** 非流式提问 */
export function askPaper(data: ChatRequest): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/api/papers/${data.paperId}/chat`, {
    method: "POST",
    body: JSON.stringify({ question: data.question }),
  });
}

/**
 * 流式提问（SSE）。
 * 接收 backend 转发的 token 流，逐 token 回调。
 * @param paperId 论文 ID
 * @param question 用户问题
 * @param onToken 每个 token 的回调
 * @param onCitations 引用 chunk_id 回调
 * @param onError 错误回调
 * @param onDone 流结束回调
 * @returns AbortController（用于取消）
 */
export function streamPaperChat(
  paperId: ID,
  question: string,
  onToken: (token: string) => void,
  onCitations?: (citations: ID[]) => void,
  onError?: (err: Error) => void,
  onDone?: () => void,
): AbortController {
  const controller = new AbortController();
  const url = `${BASE_URL}/api/papers/${paperId}/chat/stream?q=${encodeURIComponent(question)}`;

  (async () => {
    try {
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });
      if (!res.ok || !res.body) {
        throw new Error(`SSE failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件（以 \n\n 分隔）
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          const line = evt
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const event: ChatStreamEvent = JSON.parse(json);
            switch (event.type) {
              case "token":
                onToken(event.content);
                break;
              case "citation":
                onCitations?.(event.citations ?? []);
                break;
              case "error":
                onError?.(new Error(event.content));
                break;
              case "done":
                onDone?.();
                return;
            }
          } catch {
            // 忽略解析失败的事件
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err as Error);
      }
    }
  })();

  return controller;
}

/** 获取历史对话 */
export function listChatHistory(
  paperId: ID,
  page = 0,
  size = 50,
): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(
    `/api/papers/${paperId}/chat/history?page=${page}&size=${size}`,
  );
}