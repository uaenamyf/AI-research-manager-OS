/** Paper Workspace：PDF 阅读器 + AI 助手双栏（F4/F5）。 */
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getPaper, updateReadingStatus } from "@/lib/api/papers";
import { PaperCard } from "@/components/paper/PaperCard";

/** react-pdf 10.x 依赖浏览器 API（DOMMatrix），SSR 会 500，须禁用服务端渲染 */
const PdfViewer = dynamic(
  () => import("@/components/paper/PdfViewer").then((m) => m.PdfViewer),
  { ssr: false, loading: () => <Spinner /> },
);
import { PaperStatusBadge } from "@/components/paper/PaperStatusBadge";
import { Card, Spinner } from "@/components/ui";
import { usePaperStatus } from "@/lib/hooks/usePaperStatus";
import type { Paper } from "@/types";

export default function PaperWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const paperId = Number(params.id);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [readingStatus, setReadingStatus] = useState<string>("unread");


  const { status } = usePaperStatus(
    paper?.status === "PROCESSING" ? paperId : null,
  );

  useEffect(() => {
    getPaper(paperId)
      .then((p) => {
        setPaper(p);
        setReadingStatus(p.readingStatus || "unread");

      })
      .finally(() => setLoading(false));
  }, [paperId]);

  // 状态变化后刷新 paper 获取 summary
  useEffect(() => {
    if (status === "READY" || status === "ANALYZED") {
      getPaper(paperId).then(setPaper);
    }
  }, [status, paperId]);

  if (loading)
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Spinner /> Loading paper...
      </div>
    );
  if (!paper) return <p>Paper not found</p>;

  const currentStatus = status ?? paper.status;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-md px-2 py-1 -ml-2"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="whitespace-nowrap">Back</span>
          </button>
          <span className="text-gray-300">|</span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {paper.title || "Untitled"}
            </h1>
            <p className="text-sm text-gray-500">
              {[paper.authors, paper.year].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <PaperStatusBadge status={currentStatus} />
        <select
          value={readingStatus}
          onChange={(e) => {
            const v = e.target.value;
            setReadingStatus(v);
            updateReadingStatus(paper.id, { readingStatus: v });
          }}
          className="text-xs border rounded px-1 py-0.5"
        >
          <option value="unread">Unread</option>
          <option value="reading">Reading</option>
          <option value="done">Done</option>
        </select>

      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 左：PDF 阅读器 */}
        <Card className="h-[70vh] overflow-hidden">
          {paper.pdfUrl ? (
            <PdfViewer pdfKey={paper.pdfUrl} />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              No PDF available
            </div>
          )}
        </Card>

        {/* 右：AI 助手 / Paper Card */}
        <div className="space-y-4">
          {currentStatus === "PROCESSING" && (
            <Card className="flex items-center gap-2 p-4 text-sm text-blue-600">
              <Spinner /> Analyzing paper...
            </Card>
          )}
          {currentStatus === "FAILED" && (
            <Card className="p-4 text-sm text-red-600">
              Analysis failed. Please try re-uploading.
            </Card>
          )}
          {paper.summary && <PaperCard card={paper.summary} />}
        </div>
      </div>
    </div>
  );
}
