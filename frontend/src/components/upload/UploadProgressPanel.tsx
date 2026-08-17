/**
 * 全局上传/解析进度面板：悬浮于右下角，任意页面可见。
 *
 * 上传任务由 stores/upload.ts 全局管理，本组件只负责展示。
 * 多文件以卡片行展示：文件图标 + 名称 + 大小 + 状态徽章 + 进度条。
 */
"use client";

import { useState } from "react";
import { useUploadStore, type UploadItem } from "@/stores/upload";
import { formatBytes } from "@/lib/utils";

const STATUS_META: Record<
  UploadItem["status"],
  { label: string; cls: string }
> = {
  pending: { label: "Pending", cls: "bg-gray-100 text-gray-600" },
  uploading: { label: "Uploading", cls: "bg-blue-100 text-blue-700" },
  analyzing: { label: "Analyzing", cls: "bg-indigo-100 text-indigo-700" },
  done: { label: "Ready", cls: "bg-green-100 text-green-700" },
  error: { label: "Failed", cls: "bg-red-100 text-red-700" },
};

function StatusBadge({ item }: { item: UploadItem }) {
  const meta = STATUS_META[item.status];
  const text =
    item.status === "uploading"
      ? `Uploading ${item.progress}%`
      : item.status === "analyzing"
        ? `Analyzing ${item.seconds ?? 0}s`
        : meta.label;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
    >
      {item.status === "done" ? "✓ " : ""}
      {text}
    </span>
  );
}

function ItemRow({
  item,
  onRemove,
}: {
  item: UploadItem;
  onRemove: (id: string) => void;
}) {
  const showBar = item.status === "uploading" || item.status === "analyzing";
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm leading-none">📄</span>
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800"
          title={item.fileName}
        >
          {item.fileName}
        </span>
        <span className="shrink-0 text-[11px] text-gray-400">
          {formatBytes(item.fileSize)}
        </span>
        <StatusBadge item={item} />
        {(item.status === "done" || item.status === "error") && (
          <button
            onClick={() => onRemove(item.id)}
            title="Dismiss"
            className="shrink-0 text-gray-300 hover:text-gray-500"
          >
            ✕
          </button>
        )}
      </div>
      {showBar && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
          {item.status === "uploading" ? (
            // 上传：真实字节百分比进度条
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-200"
              style={{ width: `${item.progress}%` }}
            />
          ) : (
            // 解析：无真实百分比，用不确定流动动画
            <div className="progress-indeterminate h-full w-full bg-indigo-500" />
          )}
        </div>
      )}
      {item.status === "error" && item.error && (
        <p className="mt-1 truncate text-[11px] text-red-500" title={item.error}>
          {item.error}
        </p>
      )}
    </div>
  );
}

export function UploadProgressPanel() {
  const items = useUploadStore((s) => s.items);
  const removeItem = useUploadStore((s) => s.removeItem);
  const clearFinished = useUploadStore((s) => s.clearFinished);
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  const activeCount = items.filter(
    (it) =>
      it.status === "pending" || it.status === "uploading" || it.status === "analyzing",
  ).length;
  const finishedCount = items.length - activeCount;

  const summary = activeCount
    ? `${activeCount} active`
    : finishedCount
      ? `${finishedCount} finished`
      : "";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 sm:w-96">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
          <span className="text-sm leading-none">⬆️</span>
          <h3 className="flex-1 text-sm font-semibold text-gray-800">Uploads</h3>
          <span className="shrink-0 text-[11px] text-gray-400">{summary}</span>
          {finishedCount > 0 && (
            <button
              onClick={clearFinished}
              className="shrink-0 text-[11px] text-blue-600 hover:underline"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            title={open ? "Collapse" : "Expand"}
          >
            {open ? "▾" : "▸"}
          </button>
        </div>
        {open && (
          <div className="max-h-72 space-y-1.5 overflow-y-auto p-2">
            {items.map((it) => (
              <ItemRow key={it.id} item={it} onRemove={removeItem} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
