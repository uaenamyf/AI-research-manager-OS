/** Paper 相关 API（F3/F4）。 */
import { apiFetch, apiFetchRaw } from "./client";
import type {
  ID,
  Page,
  Paper,
  PaperIntelligenceCard,
  PaperListItem,
  PaperStatus,
  PaperUploadResponse,
  PresignedPost,
} from "@/types";

/**
 * 步骤 1：请求 presigned POST，用于前端直传 S3。
 * backend 签发后返回 url + fields，前端直接 POST 文件到 S3。
 */
export function getUploadUrl(
  projectId: ID,
  fileName: string,
  contentType: string,
): Promise<PresignedPost> {
  return apiFetch<PresignedPost>(
    `/api/projects/${projectId}/papers/upload-url`,
    {
      method: "POST",
      body: JSON.stringify({ fileName, contentType }),
    },
  );
}

/**
 * 步骤 2：前端直传文件到存储（S3 或本地）。
 * 用 FormData 携带 presigned POST 的 fields + file。
 */
export async function uploadToStorage(
  presigned: PresignedPost,
  file: File,
): Promise<void> {
  const form = new FormData();
  for (const [key, value] of Object.entries(presigned.fields)) {
    form.append(key, value);
  }
  form.append("file", file);

  const res = await fetch(presigned.url, {
    method: "POST",
    body: form,
    // 本地存储模式：presigned.url 指向后端 /api/local-upload/{token}，跨域直传需带 cookie
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
}

/** 兼容：旧方法名 */
export const uploadToS3 = uploadToStorage;

/**
 * 步骤 3：通知 backend 文件已上传，创建 paper 记录并触发 AI 分析。
 * backend 写 paper 表 + 发 MQ。
 */
export function createPaper(
  projectId: ID,
  payload: {
    fileName: string;
    s3Key: string;
    contentType: string;
  },
): Promise<PaperUploadResponse> {
  return apiFetch<PaperUploadResponse>(
    `/api/projects/${projectId}/papers`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/** 论文详情（含 Paper Intelligence Card） */
export function getPaper(paperId: ID): Promise<Paper> {
  return apiFetch<Paper>(`/api/papers/${paperId}`);
}

/** 项目下论文列表，支持按文件夹筛选 */
export function listPapers(
  projectId: ID,
  folderId?: ID,
  page = 0,
  size = 20,
): Promise<Page<PaperListItem>> {
  const params = new URLSearchParams();
  if (folderId) params.set("folderId", String(folderId));
  params.set("page", String(page));
  params.set("size", String(size));

  return apiFetch<Page<PaperListItem>>(
    `/api/projects/${projectId}/papers?${params}`,
  );
}

/** 移动论文到文件夹 */
export function movePaper(
  paperId: ID,
  folderId: ID | null,
): Promise<void> {
  return apiFetch<void>(`/api/papers/${paperId}/move`, {
    method: "PUT",
    body: JSON.stringify({ folderId }),
  });
}

/** 轮询论文分析状态 */
export function getPaperStatus(paperId: ID): Promise<PaperStatus> {
  return apiFetch<PaperStatus>(`/api/papers/${paperId}/status`);
}

/** 获取 Paper Intelligence Card（summary 字段） */
export function getPaperCard(
  paperId: ID,
): Promise<PaperIntelligenceCard | null> {
  return apiFetch<PaperIntelligenceCard | null>(
    `/api/papers/${paperId}/card`,
  );
}

/** 删除论文 */
export function deletePaper(paperId: ID): Promise<void> {
  return apiFetch<void>(`/api/papers/${paperId}`, { method: "DELETE" });
}

/** 兼容：直接上传（若 backend 未实现 presigned，可走 multipart 中转） */
export function uploadPaperDirect(
  projectId: ID,
  file: File,
): Promise<PaperUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return apiFetchRaw(
    `/api/projects/${projectId}/papers`,
    { method: "POST", body: form },
  ).then((res) => res.json());
}