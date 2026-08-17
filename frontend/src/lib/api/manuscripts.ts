/** Manuscript 相关 API（Writing 工作区保存）。 */
import { apiFetch } from "./client";
import type { ID } from "@/types";

export interface Manuscript {
  id: number;
  userId: ID;
  projectId: ID | null;
  title: string;
  format: "markdown" | "latex";
  content: string;
  createdTime: string;
  updatedTime: string;
}

/** 列出手稿 */
export function listManuscripts(projectId?: ID): Promise<Manuscript[]> {
  const params = projectId ? `?projectId=${projectId}` : "";
  return apiFetch<Manuscript[]>(`/api/manuscripts${params}`);
}

/** 创建手稿 */
export function createManuscript(data: {
  title?: string;
  format: string;
  content: string;
  projectId?: ID | null;
}): Promise<Manuscript> {
  return apiFetch<Manuscript>("/api/manuscripts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 更新手稿 */
export function updateManuscript(
  id: number,
  data: { title?: string; format?: string; content?: string; projectId?: ID | null },
): Promise<Manuscript> {
  return apiFetch<Manuscript>(`/api/manuscripts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** 删除手稿 */
export function deleteManuscript(id: number): Promise<void> {
  return apiFetch<void>(`/api/manuscripts/${id}`, { method: "DELETE" });
}