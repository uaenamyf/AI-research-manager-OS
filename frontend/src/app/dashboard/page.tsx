/** Dashboard：展示项目、最近论文、AI 任务、写作进度（F1/F2）。 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProjects } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { Card } from "@/components/ui";
import type { PaperListItem, ResearchProject } from "@/types";
import { PaperStatusBadge } from "@/components/paper/PaperStatusBadge";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [recentPapers, setRecentPapers] = useState<PaperListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const page = await listProjects(0, 5);
        setProjects(page.items);
        // 取第一个项目的论文作为最近论文（简化）；-1=全部文件夹
        if (page.items[0]) {
          const paperPage = await listPapers(page.items[0].id, -1, 5);
          setRecentPapers(paperPage.items);
        }
      } catch {
        // 未登录等
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Research</h1>
        <p className="text-sm text-gray-500">
          Welcome to your research workspace
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Projects</p>
          <p className="text-2xl font-bold text-gray-900">
            {projects.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Recent Papers</p>
          <p className="text-2xl font-bold text-gray-900">
            {recentPapers.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Knowledge Nodes</p>
          <p className="text-2xl font-bold text-gray-900">0</p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">Projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-gray-500">
            No papers yet.{" "}
            <Link href="/library" className="underline">
              Go to Library
            </Link>
          </p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/library?projectId=${p.id}`}
                className="block rounded-md border border-gray-100 p-3 hover:bg-gray-50"
              >
                <p className="font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">{p.domain}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">Recent Papers</h2>
        {recentPapers.length === 0 ? (
          <p className="text-sm text-gray-500">No papers yet.</p>
        ) : (
          <div className="space-y-2">
            {recentPapers.map((paper) => (
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
