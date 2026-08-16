/** PDF 浏览组件（基于 react-pdf）。 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { apiFetchRaw } from "@/lib/api/client";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * PDF 浏览组件。
 *
 * 接收存储 key 或外部 URL：
 * - 本地存储 key（如 "papers/uuid/filename.pdf"）→ 通过 API 客户端向后端拉取 Blob 渲染
 * - 外部 URL（如 "https://arxiv.org/pdf/..."）→ 直接用 iframe 嵌入 + 新标签打开
 */
export function PdfViewer({ pdfKey }: { pdfKey: string }) {
  const isExternal = pdfKey.startsWith("http://") || pdfKey.startsWith("https://");
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);

  // 外部 URL：直接使用
  useEffect(() => {
    if (isExternal) {
      setDocUrl(pdfKey);
      setLoading(false);
    }
  }, [isExternal, pdfKey]);

  // 本地 key：通过 API 客户端向后端拉取 Blob
  useEffect(() => {
    if (isExternal) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await apiFetchRaw(`/api/files/${encodeURI(pdfKey)}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setDocUrl(objectUrl);
        setError(null);
      } catch (e) {
        console.error("PDF fetch error:", e);
        if (!cancelled) {
          setError("Failed to load PDF file.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfKey, isExternal]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3.0));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-4">
          {!isExternal && (
            <>
              <span className="text-sm text-gray-600">
                Page {pageNum} / {numPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                  disabled={pageNum <= 1}
                  className="rounded px-2 py-1 text-sm hover:bg-gray-200 disabled:opacity-50"
                >
                  ◀ Prev
                </button>
                <button
                  onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                  disabled={pageNum >= numPages}
                  className="rounded px-2 py-1 text-sm hover:bg-gray-200 disabled:opacity-50"
                >
                  Next ▶
                </button>
              </div>
            </>
          )}
          {isExternal && (
            <span className="text-sm text-gray-500">
              External PDF (open in new tab for best experience)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isExternal ? (
            <a
              href={pdfKey}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
            >
              Open PDF ↗
            </a>
          ) : (
            <>
              <button
                onClick={zoomOut}
                className="rounded px-2 py-1 text-sm hover:bg-gray-200"
              >
                −
              </button>
              <span className="text-sm text-gray-600 w-16 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={zoomIn}
                className="rounded px-2 py-1 text-sm hover:bg-gray-200"
              >
                +
              </button>
            </>
          )}
        </div>
      </div>

      {/* PDF 内容 */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        {loading && !error && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">Loading PDF...</p>
          </div>
        )}
        {error && (
          <div className="text-center py-8">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}
        {docUrl && !error && isExternal && (
          <iframe
            src={docUrl}
            className="h-full w-full rounded border-0"
            title="PDF Viewer"
          />
        )}
        {docUrl && !error && !isExternal && (
          <Document
            file={docUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(loadError) => {
              console.error("PDF load error:", loadError);
              setLoading(false);
            }}
            loading={null}
          >
            <div className="flex justify-center">
              <Page
                pageNumber={pageNum}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}