/** Project 相关 API（F2）。 */
import { apiFetch } from "./client";
import type {
  ID,
  Page,
  ProjectCreateRequest,
  ResearchProject,
} from "@/types";

/** 创建项目 */
export function createProject(
  data: ProjectCreateRequest,
): Promise<ResearchProject> {
  return apiFetch<ResearchProject>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 项目列表 */
export function listProjects(
  page = 0,
  size = 20,
): Promise<Page<ResearchProject>> {
  return apiFetch<Page<ResearchProject>>(
    `/api/projects?page=${page}&size=${size}`,
  );
}

/** 项目详情 */
export function getProject(id: ID): Promise<ResearchProject> {
  return apiFetch<ResearchProject>(`/api/projects/${id}`);
}

/** 删除项目 */
export function deleteProject(id: ID): Promise<void> {
  return apiFetch<void>(`/api/projects/${id}`, { method: "DELETE" });
}