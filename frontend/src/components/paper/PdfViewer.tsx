/** PDF 浏览组件（基于 react-pdf）。 */
"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewer({
  pdfUrl,
  onSelectText,
}: {
  pdfUrl: string;
  onSelectText?: (text: string) => void;
}) {
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  // 划词：mouseup 时捕获选中文本，上抛给父组件（仅非空时回调）
  const handleMouseUp = useCallback(() => {
    if (!onSelectText) return;
    const text = window.getSelection()?.toString().trim() ?? "";
    if (text) onSelectText(text);
  }, [onSelectText]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3.0));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-4">
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
        </div>

        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* PDF 内容 */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4" onMouseUp={handleMouseUp}>
        {loading && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">Loading PDF...</p>
          </div>
        )}
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(error) => {
            console.error("PDF load error:", error);
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
      </div>
    </div>
  );
}
