/** PDF 多文件上传组件（presigned POST 三步流程，小并发队列 + 上传/解析进度）。 */
"use client";

import { useState, useRef, useEffect } from "react";
import {
  getUploadUrl,
  uploadToStorage,
  createPaper,
  getPaperStatus,
} from "@/lib/api/papers";
import type { ID, PaperUploadResponse, PaperStatus } from "@/types";
import { formatBytes } from "@/lib/utils";

type UploadItem = {
  file: File;
  status: "pending" | "uploading" | "analyzing" | "done" | "error";
  /** 上传字节进度 0-100 */
  progress: number;
  /** 上传完成后的论文 ID（解析阶段轮询用） */
  paperId?: number;
  /** 解析已用秒数 */
  seconds?: number;
  error?: string;
};

/** 并发上传数量上限，避免一次打爆存储服务。 */
const CONCURRENCY = 2;

/** 解析状态轮询间隔 ms */
const POLL_INTERVAL = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PaperUploader({
  projectId,
  folderId,
  onUploaded,
  compact = false,
}: {
  projectId: ID;
  folderId?: ID | null;
  onUploaded?: (res: PaperUploadResponse) => void;
  compact?: boolean;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateItem = (index: number, patch: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setItems(
      Array.from(files).map((file) => ({
        file,
        status: "pending" as const,
        progress: 0,
        paperId: undefined,
        seconds: 0,
      })),
    );
  };

  /** 轮询论文状态直到终态（READY/ANALYZED/FAILED）；解析中失败抛错 */
  const waitForReady = async (paperId: number) => {
    for (;;) {
      await sleep(POLL_INTERVAL);
      let s: PaperStatus;
      try {
        s = await getPaperStatus(paperId);
      } catch {
        continue; // 网络抖动时重试
      }
      if (s === "FAILED") {
        throw new Error("Paper analysis failed, please try again");
      }
      if (s !== "PROCESSING" && s !== "UPLOADED") {
        return;
      }
    }
  };

  const uploadOne = async (item: UploadItem, index: number) => {
    updateItem(index, { status: "uploading", progress: 0, error: undefined });
    try {
      // 1. 请求 presigned POST
      const presigned = await getUploadUrl(projectId, item.file.name, item.file.type);
      // 2. 直传存储（带字节进度）
      await uploadToStorage(presigned, item.file, (pct) =>
        updateItem(index, { progress: pct }),
      );
      updateItem(index, { progress: 100 });
      // 3. 通知 backend 创建 paper 记录 + 触发 AI 分析
      const res = await createPaper(projectId, {
        fileName: item.file.name,
        s3Key: presigned.fields.key ?? item.file.name,
        contentType: item.file.type,
        folderId: folderId ?? null,
      });
      // 4. 解析阶段：轮询状态直到终态，并计时
      updateItem(index, { status: "analyzing", paperId: res.paperId, seconds: 0 });
      await waitForReady(res.paperId);
      updateItem(index, { status: "done" });
      onUploaded?.(res);
      return res;
    } catch (err) {
      updateItem(index, { status: "error", error: (err as Error).message });
      return null;
    }
  };

  const handleUpload = async (files?: File[]) => {
    // 传入 files 时直接上传（compact 模式：选完即传）；否则上传已选列表
    const list =
      files?.map((file) => ({
        file,
        status: "pending" as const,
        progress: 0,
        paperId: undefined,
        seconds: 0,
      })) ?? items;
    if (list.length === 0 || uploading) return;
    if (files) setItems(list);
    setUploading(true);
    let cursor = 0;
    // 固定并发数的 worker 队列
    const worker = async () => {
      while (cursor < list.length) {
        const i = cursor++;
        await uploadOne(list[i], i);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker),
    );
    setUploading(false);
  };

  // compact 模式：选择文件后立即上传
  const handleCompactFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 先拷贝再清空：value="" 会清掉 e.target.files 的引用内容
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = ""; // 允许重复选择同一文件
    if (files.length === 0) return;
    handleUpload(files);
  };

  // 解析计时：每秒为 analyzing 中的项 +1s，让用户感知等待时长
  const hasAnalyzing = items.some((it) => it.status === "analyzing");
  useEffect(() => {
    if (!hasAnalyzing) return;
    const timer = setInterval(() => {
      setItems((prev) =>
        prev.map((it) =>
          it.status === "analyzing"
            ? { ...it, seconds: (it.seconds ?? 0) + 1 }
            : it,
        ),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [hasAnalyzing]);

  const doneCount = items.filter((it) => it.status === "done").length;

  return (
    <div className={compact ? "w-full" : "rounded-lg border border-dashed border-gray-300 p-4"}>
      <div className={compact ? "flex items-center gap-2" : ""}>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={compact ? handleCompactFiles : (e) => handleFiles(e.target.files)}
          className={compact ? "hidden" : "block w-full text-sm text-gray-600"}
        />
        <button
          onClick={() => (compact ? fileInputRef.current?.click() : handleUpload())}
          disabled={!compact && (items.length === 0 || uploading)}
          className={
            compact
              ? "whitespace-nowrap text-xs text-blue-600 hover:text-blue-800"
              : "mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          }
        >
          {uploading
            ? `Uploading ${doneCount}/${items.length}…`
            : items.length > 1
              ? `Upload & Analyze File (${items.length})`
              : "Upload & Analyze File"}
        </button>
      </div>

      {/* 上传/解析进度列表 */}
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-xs text-gray-600">
          {items.map((it, i) => (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {it.file.name} · {formatBytes(it.file.size)}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {it.status === "pending" && (
                    <span className="text-gray-400">Pending</span>
                  )}
                  {it.status === "uploading" && (
                    <span className="tabular-nums text-blue-500">
                      Uploading {it.progress}%
                    </span>
                  )}
                  {it.status === "analyzing" && (
                    <span className="tabular-nums animate-pulse text-indigo-500">
                      Analyzing {it.seconds}s
                    </span>
                  )}
                  {it.status === "done" && (
                    <span className="text-green-600">✓ Ready</span>
                  )}
                  {it.status === "error" && (
                    <span className="text-red-600" title={it.error}>
                      Failed
                    </span>
                  )}
                </span>
              </div>
              {(it.status === "uploading" || it.status === "analyzing") && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
                  {it.status === "uploading" ? (
                    // 上传：真实字节百分比进度条
                    <div
                      className="h-full bg-blue-500 transition-all duration-200"
                      style={{ width: `${it.progress}%` }}
                    />
                  ) : (
                    // 解析：无真实百分比，用不确定流动动画
                    <div className="progress-indeterminate h-full w-full text-indigo-500" />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
