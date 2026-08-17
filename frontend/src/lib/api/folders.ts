/** 文件夹管理 API */
import { apiFetch } from "./client";
import type { ID, Folder } from "@/types";

/** 创建文件夹 */
export function createFolder(
  projectId: ID,
  parentId: ID | undefined,
  name: string,
): Promise<Folder> {
  return apiFetch<Folder>(`/api/folders`, {
    method: "POST",
    body: JSON.stringify({ projectId, parentId, name }),
  });
}

/** 获取文件夹树 */
export function getFolderTree(projectId: ID): Promise<Folder[]> {
  return apiFetch<Folder[]>(`/api/projects/${projectId}/folders/tree`);
}

/** 删除文件夹 */
export function deleteFolder(folderId: ID): Promise<void> {
  return apiFetch<void>(`/api/folders/${folderId}`, {
    method: "DELETE",
  });
}
