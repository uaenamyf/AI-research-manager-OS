/** PDF 颅览组件（基于 react-pdf）。 */
"use client";

import { useState } from "react";
// import { Document, Page } from "react-pdf";
// 注：需安装 react-pdf 后启用，此处为骨架占位

export function PdfViewer({ pdfUrl }: { pdfUrl: string }) {
  const [pageNum, setPageNum] = useState(1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _url = pdfUrl; // 实际使用时传入 Document

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
        <span className="text-sm text-gray-600">Page {pageNum}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            className="rounded px-2 py-1 text-sm hover:bg-gray-200"
          >
            Prev
          </button>
          <button
            onClick={() => setPageNum((p) => p + 1)}
            className="rounded px-2 py-1 text-sm hover:bg-gray-200"
          >
            Next
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        {/* <Document file={pdfUrl}>
          <Page pageNumber={pageNum} />
        </Document> */}
        <p className="text-center text-gray-400">
          PDF viewer placeholder (install react-pdf to enable)
        </p>
      </div>
    </div>
  );
}
