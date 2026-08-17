/** Project 相关 API（F2）。 */
import { apiFetch } from "./client";
import type { ID, Page, ResearchProject } from "@/types";

/** 项目列表 */
export function listProjects(
  page = 0,
  size = 20,
): Promise<Page<ResearchProject>> {
  return apiFetch<Page<ResearchProject>>(
    `/api/projects?page=${page}&size=${size}`,
  );
}