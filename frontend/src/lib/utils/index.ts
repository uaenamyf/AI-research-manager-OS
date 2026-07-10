/** 前端通用工具函数。 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { PaperStatus } from "@/types";

/** classnames 合并，处理 Tailwind className 冲突 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 格式化日期 */
export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** 论文状态对应的展示文本与颜色 */
export const PAPER_STATUS_META: Record<
  PaperStatus,
  { label: string; color: string }
> = {
  UPLOADED: { label: "Uploaded", color: "bg-gray-200 text-gray-700" },
  PROCESSING: { label: "Processing", color: "bg-blue-100 text-blue-700" },
  ANALYZED: { label: "Analyzed", color: "bg-indigo-100 text-indigo-700" },
  READY: { label: "Ready", color: "bg-green-100 text-green-700" },
  FAILED: { label: "Failed", color: "bg-red-100 text-red-700" },
};

/** 截断文本 */
export function truncate(text: string, max = 100): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

/** 格式化文件大小 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 延时 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}