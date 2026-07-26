/** Writing Assistant 相关 API（Agent 4：改写/润色/审稿回复）。 */
import { apiFetch } from "./client";
import type { WritingRewriteRequest, WritingRewriteResult } from "@/types";

/** 同步改写文本，返回改写后的结果。 */
export function rewriteText(
  data: WritingRewriteRequest,
): Promise<WritingRewriteResult> {
  return apiFetch<WritingRewriteResult>("/api/writing/rewrite", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
