/** Paper Workspace：PDF 阅读器 + AI 助手双栏（F4/F5）。 */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPaper } from "@/lib/api/papers";
import { PdfViewer } from "@/components/paper/PdfViewer";
import { PaperCard } from "@/components/paper/PaperCard";
import { PaperStatusBadge } from "@/components/paper/PaperStatusBadge";
import { Card, Spinner } from "@/components/ui";
import { usePaperStatus } from "@/lib/hooks/usePaperStatus";
import type { Paper } from "@/types";

export default function PaperWorkspacePage() {
  const params = useParams();
  const paperId = Number(params.id);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);

  const { status } = usePaperStatus(
    paper?.status === "PROCESSING" ? paperId : null,
  );

  useEffect(() => {
    getPaper(paperId)
      .then(setPaper)
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
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {paper.title || "Untitled"}
          </h1>
          <p className="text-sm text-gray-500">
            {paper.authors} · {paper.year}
          </p>
        </div>
        <PaperStatusBadge status={currentStatus} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 左：PDF 阅读器 */}
        <Card className="h-[70vh] overflow-hidden">
          {paper.pdfUrl ? (
            <PdfViewer pdfUrl={paper.pdfUrl} />
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
