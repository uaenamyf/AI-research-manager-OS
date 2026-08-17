/**
 * PDF 多文件上传按钮。
 *
 * 上传/解析进度由全局 store（stores/upload.ts）管理并展示在全局
 * UploadProgressPanel，切页不丢、任意页面可见。本组件只负责：
 * 选择文件触发上传 + 上传完成时通知父级刷新列表。
 */
"use client";

import { useEffect, useRef } from "react";
import { useUploadStore } from "@/stores/upload";
import type { ID } from "@/types";

export function PaperUploader({
  projectId,
  folderId,
  onUploaded,
  compact = false,
}: {
  projectId: ID;
  folderId?: ID | null;
  onUploaded?: () => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addFiles = useUploadStore((s) => s.addFiles);
  const items = useUploadStore((s) => s.items);

  // 本项目的活跃上传（决定按钮文案；全局面板展示所有详情）
  const mine = items.filter((it) => it.projectId === projectId);
  const uploading = mine.some(
    (it) => it.status === "pending" || it.status === "uploading",
  );
  const analyzing = mine.some((it) => it.status === "analyzing");

  // 有论文变为 done 时通知父级刷新列表（覆盖切页期间完成的论文）
  const seenDone = useRef<Set<string>>(new Set());
  useEffect(() => {
    const done = items.filter(
      (it) => it.status === "done" && !seenDone.current.has(it.id),
    );
    if (done.length > 0) {
      done.forEach((it) => seenDone.current.add(it.id));
      onUploaded?.();
    }
  }, [items, onUploaded]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 先拷贝再清空：value="" 会清掉 e.target.files 的引用内容
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;
    addFiles(files, projectId, folderId ?? null);
  };

  const label = uploading
    ? "Uploading…"
    : analyzing
      ? "Analyzing…"
      : "Upload & Analyze";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={!projectId}
        title={!projectId ? "Select a project first" : undefined}
        className={
          compact
            ? "whitespace-nowrap text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40"
            : "rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        }
      >
        {label}
      </button>
    </>
  );
}
