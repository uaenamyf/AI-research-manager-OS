/** Citation 相关 API（Phase 2）。 */
import { apiFetch } from "./client";

export type CitationFormat = "APA" | "MLA" | "GB_7714";

/** 批量生成参考文献列表 */
export function getBibliography(
  paperIds: number[],
  format: CitationFormat = "APA",
): Promise<{ citations: string[]; format: string; count: number }> {
  return apiFetch<{ citations: string[]; format: string; count: number }>(
    `/api/citation/bibliography?format=${format}`,
    {
      method: "POST",
      body: JSON.stringify({ paperIds }),
    },
  );
}