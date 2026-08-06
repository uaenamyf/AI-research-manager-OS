/** Writing Assistant 相关 API（Agent 4：改写/润色/回复审稿人/Cover letter）。 */
import { apiFetch } from "./client";
import type { WritingTransformRequest, WritingTransformResult } from "@/types";

/** 文本变换（同步，返回变换后文本） */
export function transformText(
  data: WritingTransformRequest,
): Promise<WritingTransformResult> {
  return apiFetch<WritingTransformResult>("/api/writing/transform", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
