/** 项目详情页：展示论文列表 + 上传入口（F2/F3）。 */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { PaperUploader } from "@/components/paper/PaperUploader";
import { PaperStatusBadge } from "@/components/paper/PaperStatusBadge";
import { Card } from "@/components/ui";
import type { PaperListItem, ResearchProject } from "@/types";
import { formatDate } from "@/lib/utils";

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [p, paperPage] = await Promise.all([
      getProject(projectId),
      listPapers(projectId, 0, 100),
    ]);
    setProject(p);
    setPapers(paperPage.items);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!project) return <p>Project not found</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        <p className="text-sm text-gray-500">
          {project.domain} · {formatDate(project.createdTime)}
        </p>
        {project.description && (
          <p className="mt-2 text-sm text-gray-600">{project.description}</p>
        )}
      </div>

      <PaperUploader projectId={projectId} onUploaded={load} />

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">
          Papers ({papers.length})
        </h2>
        {papers.length === 0 ? (
          <p className="text-sm text-gray-500">
            No papers yet. Upload your first PDF above.
          </p>
        ) : (
          <div className="space-y-2">
            {papers.map((paper) => (
              <Link
                key={paper.id}
                href={`/papers/${paper.id}`}
                className="block rounded-md border border-gray-100 p-3 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {paper.title}
                  </span>
                  <PaperStatusBadge status={paper.status} />
                </div>
                <p className="text-xs text-gray-500">
                  {paper.authors} · {formatDate(paper.createdTime)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
