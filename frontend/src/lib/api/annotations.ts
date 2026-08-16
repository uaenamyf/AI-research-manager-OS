/** Annotation 相关 API（Phase 3）。 */
import { apiFetch } from "./client";

export interface Annotation {
  id: number;
  paperId: number;
  userId: number;
  pageNum: number;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  text: string | null;
  note: string | null;
  color: string;
  createdTime: string;
  updatedTime: string;
}

/** 获取论文批注 */
export function listAnnotations(paperId: number): Promise<Annotation[]> {
  return apiFetch<Annotation[]>(`/api/papers/${paperId}/annotations`);
}

/** 创建批注 */
export function createAnnotation(
  paperId: number,
  data: Partial<Annotation>,
): Promise<Annotation> {
  return apiFetch<Annotation>(`/api/papers/${paperId}/annotations`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 更新批注 */
export function updateAnnotation(
  id: number,
  data: { note?: string; color?: string },
): Promise<Annotation> {
  return apiFetch<Annotation>(`/api/annotations/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** 删除批注 */
export function deleteAnnotation(id: number): Promise<void> {
  return apiFetch<void>(`/api/annotations/${id}`, { method: "DELETE" });
}