/** Export 相关 API（Phase 4 BibTeX/RIS）。 */
import { apiFetch } from "./client";

/** 单篇导出 BibTeX */
export function exportBibtex(paperId: number): Promise<{ bibtex: string }> {
  return apiFetch<{ bibtex: string }>(`/api/papers/${paperId}/export/bibtex`);
}

/** 单篇导出 RIS */
export function exportRis(paperId: number): Promise<{ ris: string }> {
  return apiFetch<{ ris: string }>(`/api/papers/${paperId}/export/ris`);
}

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