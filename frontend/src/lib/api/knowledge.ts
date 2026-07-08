/** Knowledge Base 相关 API（F6）。 */
import { apiFetch } from "./client";
import type { ID, KnowledgeSearchResult, KnowledgeTag } from "@/types";

/** 获取所有标签（按使用次数降序） */
export function listTags(): Promise<KnowledgeTag[]> {
  return apiFetch<KnowledgeTag[]>("/api/knowledge/tags");
}

/** 按关键词搜索论文（关联搜索） */
export function searchKnowledge(
  query: string,
  limit = 20,
): Promise<KnowledgeSearchResult[]> {
  return apiFetch<KnowledgeSearchResult[]>(
    `/api/knowledge/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

/** 获取某标签下的论文 ID */
export function getPapersByTag(
  tag: string,
  page = 0,
  size = 20,
): Promise<ID[]> {
  return apiFetch<ID[]>(
    `/api/knowledge/tags/${encodeURIComponent(tag)}/papers?page=${page}&size=${size}`,
  );
}