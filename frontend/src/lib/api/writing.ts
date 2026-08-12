/** Writing Assistant 相关 API（Agent 4：改写/润色/翻译/回复审稿人/Cover letter）。 */
import { apiFetch } from "./client";
import type {
  MachineTranslateRequest,
  MachineTranslateResult,
  WritingRewriteRequest,
  WritingRewriteResult,
} from "@/types";

/** 同步改写文本，返回改写后的结果。 */
export function rewriteText(
  data: WritingRewriteRequest,
): Promise<WritingRewriteResult> {
  return apiFetch<WritingRewriteResult>("/api/writing/rewrite", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 机器翻译（翻译器，非 LLM）：快速翻译，用于划词翻译 Tab。 */
// 2026-08-12 myf: 新增机器翻译 API
export function translateMachine(
  data: MachineTranslateRequest,
): Promise<MachineTranslateResult> {
  return apiFetch<MachineTranslateResult>("/api/writing/translate-machine", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
