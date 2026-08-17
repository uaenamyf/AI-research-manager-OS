/**
 * 全局论文上传/解析进度 store。
 *
 * 上传队列、轮询、计时都运行在模块级（不依赖组件生命周期），
 * 组件卸载（切换页面）后上传与解析继续在后台跑，进度存于此全局 store，
 * 配合 UploadProgressPanel 在任何页面都能看到实时进度。
 *
 * 2026-08-17: 原 PaperUploader 内局部 state 切页即丢，改为全局 store；
 * 支持 localStorage 持久化，刷新后 analyzing 项重新挂起轮询（后端仍在解析）。
 * 支持 cancel(id) 中断：pending 移出队列、uploading 中断 XHR、analyzing 停止轮询并删除后端论文。
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getUploadUrl,
  uploadToStorage,
  createPaper,
  getPaperStatus,
  deletePaper,
} from "@/lib/api/papers";
import type { ID, PaperStatus } from "@/types";

export type UploadStatus =
  | "pending"
  | "uploading"
  | "analyzing"
  | "done"
  | "error";

export interface UploadItem {
  id: string;
  fileName: string;
  fileSize: number;
  projectId: ID;
  folderId: ID | null;
  status: UploadStatus;
  /** 上传字节进度 0-100 */
  progress: number;
  /** 上传完成后的论文 ID（解析阶段轮询用） */
  paperId?: number;
  /** 解析已用秒数 */
  seconds?: number;
  error?: string;
}

interface UploadStore {
  items: UploadItem[];
  addFiles: (files: File[], projectId: ID, folderId?: ID | null) => void;
  /** 中断某条任务：pending 移出队列 / uploading 中断上传 / analyzing 停止轮询并删除后端论文 */
  cancel: (id: string) => void;
  /** 关闭已完成/失败条目的展示（不影响后端） */
  removeItem: (id: string) => void;
  clearFinished: () => void;
  /** 内部更新单项（上传/轮询/计时回调用） */
  _updateItem: (id: string, patch: Partial<UploadItem>) => void;
}

const CONCURRENCY = 2;
const POLL_INTERVAL = 2500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 仅运行时持有的 File 引用（不持久化；pending/uploading 依赖它） */
const fileMap = new Map<string, File>();

/** 上传中 XHR 的中断控制器（id -> AbortController） */
const uploadControllers = new Map<string, AbortController>();

/** 已请求中断轮询的 analyzing 任务 id */
const cancelledPolls = new Set<string>();

// 模块级上传队列（跨组件/页面存活，切页不中断）
const queue: string[] = [];
let activeWorkers = 0;

/** 模块级解析计时器 */
let analyzeTimer: ReturnType<typeof setInterval> | null = null;

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 轮询论文状态直到终态；解析失败抛错；被中断（cancel analyzing）时正常返回 */
async function pollReady(paperId: number, itemId: string): Promise<void> {
  for (;;) {
    if (cancelledPolls.has(itemId)) return;
    await sleep(POLL_INTERVAL);
    if (cancelledPolls.has(itemId)) return;
    let s: PaperStatus;
    try {
      s = await getPaperStatus(paperId);
    } catch {
      continue; // 网络抖动时重试
    }
    if (s === "FAILED") throw new Error("Paper analysis failed, please try again");
    if (s !== "PROCESSING" && s !== "UPLOADED") return;
  }
}

/** 等待解析完成：成功置 done，失败置 error；被中断则静默结束 */
async function watchAnalysis(item: UploadItem) {
  try {
    await pollReady(item.paperId!, item.id);
    if (cancelledPolls.has(item.id)) {
      cancelledPolls.delete(item.id);
      return;
    }
    useUploadStore.getState()._updateItem(item.id, { status: "done" });
  } catch (err) {
    if (cancelledPolls.has(item.id)) {
      cancelledPolls.delete(item.id);
      return;
    }
    useUploadStore.getState()._updateItem(item.id, {
      status: "error",
      error: (err as Error).message,
    });
  }
}

/** 单个文件完整流程：presigned → 直传 → 建 paper 记录 → 轮询解析 */
async function uploadOne(item: UploadItem): Promise<void> {
  const controller = new AbortController();
  uploadControllers.set(item.id, controller);
  useUploadStore.getState()._updateItem(item.id, {
    status: "uploading",
    progress: 0,
    error: undefined,
  });
  try {
    const file = fileMap.get(item.id);
    if (!file) throw new Error("File not found, please try again");
    // 1. 请求 presigned POST
    const presigned = await getUploadUrl(item.projectId, item.fileName, file.type);
    // 2. 直传存储（带字节进度，可中断）
    await uploadToStorage(
      presigned,
      file,
      (pct) => useUploadStore.getState()._updateItem(item.id, { progress: pct }),
      controller.signal,
    );
    useUploadStore.getState()._updateItem(item.id, { progress: 100 });
    // 3. 通知 backend 创建 paper 记录 + 触发 AI 分析
    const res = await createPaper(item.projectId, {
      fileName: item.fileName,
      s3Key: presigned.fields.key ?? item.fileName,
      contentType: file.type,
      folderId: item.folderId,
    });
    // 4. 解析阶段：轮询状态直到终态
    useUploadStore.getState()._updateItem(item.id, {
      status: "analyzing",
      paperId: res.paperId,
      seconds: 0,
    });
    await watchAnalysis({ ...item, paperId: res.paperId, status: "analyzing" });
  } catch (err) {
    // 用户主动取消上传：该项已从列表移除，静默丢弃，不显示错误
    if (controller.signal.aborted) return;
    useUploadStore.getState()._updateItem(item.id, {
      status: "error",
      error: (err as Error).message,
    });
  } finally {
    uploadControllers.delete(item.id);
  }
}

/** 从队列取任务执行（固定并发上限） */
function pump() {
  while (activeWorkers < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!;
    const item = useUploadStore.getState().items.find((it) => it.id === id);
    if (!item) continue;
    activeWorkers++;
    uploadOne(item).finally(() => {
      activeWorkers--;
      pump();
    });
  }
}

/** 解析计时：存在 analyzing 项时每秒 +1s，让用户感知等待时长 */
function syncAnalyzingTimer() {
  const has = useUploadStore
    .getState()
    .items.some((it) => it.status === "analyzing");
  if (has && !analyzeTimer) {
    analyzeTimer = setInterval(() => {
      const st = useUploadStore.getState();
      if (!st.items.some((it) => it.status === "analyzing")) {
        syncAnalyzingTimer();
        return;
      }
      useUploadStore.setState({
        items: st.items.map((it) =>
          it.status === "analyzing"
            ? { ...it, seconds: (it.seconds ?? 0) + 1 }
            : it,
        ),
      });
    }, 1000);
  } else if (!has && analyzeTimer) {
    clearInterval(analyzeTimer);
    analyzeTimer = null;
  }
}

export const useUploadStore = create<UploadStore>()(
  persist(
    (set, get) => ({
      items: [],

      addFiles(files, projectId, folderId) {
        const newItems: UploadItem[] = files.map((f) => ({
          id: uid(),
          fileName: f.name,
          fileSize: f.size,
          projectId,
          folderId: folderId ?? null,
          status: "pending",
          progress: 0,
        }));
        files.forEach((f, i) => fileMap.set(newItems[i].id, f));
        set({ items: [...get().items, ...newItems] });
        queue.push(...newItems.map((it) => it.id));
        pump();
      },

      cancel(id) {
        const item = get().items.find((it) => it.id === id);
        if (!item) return;
        if (item.status === "pending") {
          // 还在队列等待：直接从队列移除
          const qIdx = queue.indexOf(id);
          if (qIdx >= 0) queue.splice(qIdx, 1);
        } else if (item.status === "uploading") {
          // 上传中：中断 XHR（uploadOne 捕获 AbortError 后静默丢弃）
          uploadControllers.get(id)?.abort();
        } else if (item.status === "analyzing") {
          // 解析中：停止轮询 + 删除已创建的 backend 论文（含 PDF/向量清理）
          cancelledPolls.add(id);
          if (item.paperId) {
            deletePaper(item.paperId).catch(() => {
              /* 删除失败不阻塞：解析完成后论文仍在库中，用户可从 Library 删除 */
            });
          }
        }
        // 从全局列表移除（uploadOne 后续对已移除 id 的更新为 no-op）
        get().removeItem(id);
      },

      removeItem(id) {
        fileMap.delete(id);
        set({ items: get().items.filter((it) => it.id !== id) });
        syncAnalyzingTimer();
      },

      clearFinished() {
        set({
          items: get().items.filter(
            (it) =>
              it.status === "pending" ||
              it.status === "uploading" ||
              it.status === "analyzing",
          ),
        });
      },

      _updateItem(id, patch) {
        set({
          items: get().items.map((it) =>
            it.id === id ? { ...it, ...patch } : it,
          ),
        });
        if (
          patch.status === "analyzing" ||
          patch.status === "done" ||
          patch.status === "error"
        ) {
          syncAnalyzingTimer();
        }
      },
    }),
    {
      name: "researchos-uploads",
      // pending/uploading 依赖内存 File 引用，刷新后无法恢复，不持久化
      partialize: (s) => ({
        items: s.items.filter(
          (it) =>
            it.status === "analyzing" || it.status === "done" || it.status === "error",
        ),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 刷新后重新挂起 analyzing 项的轮询（后端仍在后台解析）
          state.items
            .filter((it) => it.status === "analyzing" && it.paperId)
            .forEach((it) => watchAnalysis(it));
          syncAnalyzingTimer();
        }
      },
    },
  ),
);
