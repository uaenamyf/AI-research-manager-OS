/** 学术文献检索 API：backend -> ai-service -> literature-search-mcp（七库融合）。 */
import { apiFetch } from "./client";
import type { LiteratureSearchResponse } from "@/types";

/**
 * 检索学术文献（PubMed/Europe PMC/bioRxiv/Crossref/OpenAlex/Semantic Scholar/arXiv）。
 *
 * @param sources 传空数组/undefined 时检索全部数据源
 */
export function searchLiterature(params: {
  query: string;
  limit?: number;
  sources?: string[];
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
}): Promise<LiteratureSearchResponse> {
  const sp = new URLSearchParams();
  sp.set("query", params.query);
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.sources?.length) sp.set("sources", params.sources.join(","));
  if (params.yearFrom) sp.set("year_from", String(params.yearFrom));
  if (params.yearTo) sp.set("year_to", String(params.yearTo));
  if (params.openAccess) sp.set("open_access", String(params.openAccess));
  return apiFetch<LiteratureSearchResponse>(`/api/literature/search?${sp.toString()}`);
}
