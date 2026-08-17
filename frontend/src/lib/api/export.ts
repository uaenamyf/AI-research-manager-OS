/** Export 相关 API（Phase 4 BibTeX/RIS）。 */
import { apiFetch } from "./client";

/** 批量导出 BibTeX */
export function exportBibtexBatch(paperIds: number[]): Promise<{ bibtex: string; count: string }> {
  return apiFetch<{ bibtex: string; count: string }>(
    "/api/papers/export/bibtex",
    { method: "POST", body: JSON.stringify({ paperIds }) },
  );
}

/** 批量导出 RIS */
export function exportRisBatch(paperIds: number[]): Promise<{ ris: string; count: string }> {
  return apiFetch<{ ris: string; count: string }>(
    "/api/papers/export/ris",
    { method: "POST", body: JSON.stringify({ paperIds }) },
  );
}