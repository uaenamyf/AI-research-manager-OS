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

/** 获取子文件夹列表 */
export function getChildFolders(
  projectId: ID,
  parentId?: ID,
): Promise<Folder[]> {
  const url = parentId
    ? `/api/projects/${projectId}/folders?parentId=${parentId}`
    : `/api/projects/${projectId}/folders`;
  return apiFetch<Folder[]>(url);
}

/** 重命名文件夹 */
export function renameFolder(
  folderId: ID,
  newName: string,
): Promise<Folder> {
  return apiFetch<Folder>(`/api/folders/${folderId}/rename`, {
    method: "PUT",
    body: JSON.stringify({ name: newName }),
  });
}

/** 移动文件夹 */
export function moveFolder(
  folderId: ID,
  newParentId: ID | null,
): Promise<Folder> {
  return apiFetch<Folder>(`/api/folders/${folderId}/move`, {
    method: "PUT",
    body: JSON.stringify({ parentId: newParentId }),
  });
}

/** 删除文件夹 */
export function deleteFolder(folderId: ID): Promise<void> {
  return apiFetch<void>(`/api/folders/${folderId}`, {
    method: "DELETE",
  });
}

/** 更新排序 */
export function updateSortOrder(
  folderId: ID,
  sortOrder: number,
): Promise<void> {
  return apiFetch<void>(`/api/folders/${folderId}/sort`, {
    method: "PUT",
    body: JSON.stringify({ sortOrder }),
  });
}
