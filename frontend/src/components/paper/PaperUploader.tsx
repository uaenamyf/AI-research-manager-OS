/** PDF 多文件上传组件（presigned POST 三步流程，小并发队列）。 */
"use client";

import { useState } from "react";
import { getUploadUrl, uploadToStorage, createPaper } from "@/lib/api/papers";
import type { ID, PaperUploadResponse } from "@/types";
import { formatBytes } from "@/lib/utils";

type UploadItem = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

/** 并发上传数量上限，避免一次打爆存储服务。 */
const CONCURRENCY = 2;

export function PaperUploader({
  projectId,
  folderId,
  onUploaded,
}: {
  projectId: ID;
  folderId?: ID | null;
  onUploaded?: (res: PaperUploadResponse) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const updateItem = (index: number, patch: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setItems(Array.from(files).map((file) => ({ file, status: "pending" })));
  };

  const uploadOne = async (item: UploadItem, index: number) => {
    updateItem(index, { status: "uploading", error: undefined });
    try {
      // 1. 请求 presigned POST
      const presigned = await getUploadUrl(projectId, item.file.name, item.file.type);
      // 2. 直传存储
      await uploadToStorage(presigned, item.file);
      // 3. 通知 backend 创建 paper 记录 + 触发分析
      const res = await createPaper(projectId, {
        fileName: item.file.name,
        s3Key: presigned.fields.key ?? item.file.name,
        contentType: item.file.type,
        folderId: folderId ?? null,
      });
      updateItem(index, { status: "done" });
      return res;
    } catch (err) {
      updateItem(index, { status: "error", error: (err as Error).message });
      return null;
    }
  };

  const handleUpload = async () => {
    if (items.length === 0 || uploading) return;
    setUploading(true);
    let last: PaperUploadResponse | undefined;
    let cursor = 0;
    // 固定并发数的 worker 队列
    const worker = async () => {
      while (cursor < items.length) {
        const i = cursor++;
        const res = await uploadOne(items[i], i);
        if (res) last = res;
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
    );
    setUploading(false);
    // 全部结束后统一通知父组件刷新列表
    if (last) onUploaded?.(last);
  };

  const doneCount = items.filter((it) => it.status === "done").length;

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4">
      <input
        type="file"
        accept="application/pdf"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="block w-full text-sm text-gray-600"
      />
      {items.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-gray-600">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {it.file.name} · {formatBytes(it.file.size)}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {it.status === "pending" && (
                  <span className="text-gray-400">Pending</span>
                )}
                {it.status === "uploading" && (
                  <span className="text-blue-500">Uploading…</span>
                )}
                {it.status === "done" && (
                  <span className="text-green-600">✓</span>
                )}
                {it.status === "error" && (
                  <span className="text-red-600" title={it.error}>
                    Failed
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={handleUpload}
        disabled={items.length === 0 || uploading}
        className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {uploading
          ? `Uploading ${doneCount}/${items.length}…`
          : items.length > 1
            ? `Upload & Analyze (${items.length})`
            : "Upload & Analyze"}
      </button>
    </div>
  );
}
