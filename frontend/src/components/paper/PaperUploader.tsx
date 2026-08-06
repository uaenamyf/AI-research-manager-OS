/** PDF 上传组件（presigned POST 三步流程）。 */
"use client";

import { useState } from "react";
import { getUploadUrl, uploadToStorage, createPaper } from "@/lib/api/papers";
import type { ID, PaperUploadResponse } from "@/types";
import { formatBytes } from "@/lib/utils";

export function PaperUploader({
  projectId,
  folderId,
  onUploaded,
}: {
  projectId: ID;
  folderId?: ID | null;
  onUploaded?: (res: PaperUploadResponse) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // 1. 请求 presigned POST
      const presigned = await getUploadUrl(
        projectId,
        file.name,
        file.type,
      );
      // 2. 直传存储
      await uploadToStorage(presigned, file);
      // 3. 通知 backend 创建 paper 记录 + 触发分析
      const res = await createPaper(projectId, {
        fileName: file.name,
        s3Key: presigned.fields.key ?? file.name,
        contentType: file.type,
        folderId: folderId ?? null,
      });
      onUploaded?.(res);
      setFile(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4">
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-gray-600"
      />
      {file && (
        <p className="mt-2 text-xs text-gray-500">
          {file.name} · {formatBytes(file.size)}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload & Analyze"}
      </button>
    </div>
  );
}
