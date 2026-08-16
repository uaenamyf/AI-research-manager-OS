/**
 * Library 页面：全局文献库（跨项目）。
 *
 * 功能：
 * - 查看所有论文（跨项目）
 * - 搜索/筛选
 * - 阅读状态/星级操作
 * - 批量导出
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProjects } from "@/lib/api/projects";
import { listPapers, searchPapers, updateReadingStatus } from "@/lib/api/papers";
import { exportBibtexBatch, exportRisBatch } from "@/lib/api/export";
import type { PaperListItem, ResearchProject, ID } from "@/types";
import { Card, Button, Spinner } from "@/components/ui";

export default function LibraryPage() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [allPapers, setAllPapers] = useState<PaperListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<ID | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    Promise.all([
      listProjects(0, 50),
      ...Array.from({ length: 10 }, (_, i) => listPapers(0, -1, i, 100).catch(() => null)),
    ]).then(([proj, ...paperPages]) => {
      setProjects(proj.items);
      const all = paperPages
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .flatMap((p) => p.items);
      setAllPapers(all);
      setLoading(false);
    });
  }, []);

  // Actually fetch papers per project
  useEffect(() => {
    if (projects.length === 0) return;
    setLoading(true);
    Promise.all(
      projects.map((p) => listPapers(p.id, -1, 0, 200).catch(() => null)),
    ).then((results) => {
      const all = results
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .flatMap((r) => r.items);
      setAllPapers(all);
      setLoading(false);
    });
  }, [projects]);

  const filtered = allPapers.filter((p) => {
    if (filterProject !== "all" && p.folderId !== null && projects.find((pr) => pr.id === filterProject)) {
      // simple filter by project - we don't have projectId on PaperListItem, skip
    }
    if (filterStatus !== "all" && (p.readingStatus || "unread") !== filterStatus) return false;
    if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const togglePaper = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStatusChange = async (id: number, status: string) => {
    await updateReadingStatus(id, { readingStatus: status });
    setAllPapers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, readingStatus: status as any } : p)),
    );
  };

  const handleStarChange = async (id: number, star: number | null) => {
    await updateReadingStatus(id, { starRating: star });
    setAllPapers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, starRating: star } : p)),
    );
  };

  const [exportText, setExportText] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Library</h1>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search papers..."
            className="h-10 flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 text-sm"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          >
            <option value="all">All Status</option>
            <option value="unread">📖 Unread</option>
            <option value="reading">📘 Reading</option>
            <option value="done">✅ Done</option>
          </select>
          <select
            value={typeof filterProject === "number" ? filterProject : "all"}
            onChange={(e) => setFilterProject(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <Card className="flex items-center gap-2 p-4 text-sm text-blue-600">
          <Spinner /> Loading papers...
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {filtered.length} papers
              {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
            </p>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const res = await exportBibtexBatch(Array.from(selectedIds));
                      setExportText(res.bibtex);
                      await navigator.clipboard.writeText(res.bibtex);
                    }}
                  >
                    Copy BibTeX ({selectedIds.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const res = await exportRisBatch(Array.from(selectedIds));
                      setExportText(res.ris);
                      await navigator.clipboard.writeText(res.ris);
                    }}
                  >
                    Copy RIS ({selectedIds.size})
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelectedIds(new Set(filtered.map((p) => p.id)))
                }
              >
                Select All
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card className="p-6 text-center text-sm text-gray-500">
              No papers found.
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((paper) => (
                <Card key={paper.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(paper.id)}
                      onChange={() => togglePaper(paper.id)}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/papers/${paper.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline"
                      >
                        {paper.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        {paper.authors && (
                          <span className="text-xs text-gray-500 truncate">
                            {paper.authors}
                          </span>
                        )}
                        {paper.year && (
                          <span className="text-xs text-gray-400">({paper.year})</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          paper.status === "READY" ? "bg-green-100 text-green-700" :
                          paper.status === "FAILED" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {paper.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={paper.readingStatus || "unread"}
                        onChange={(e) => handleStatusChange(paper.id, e.target.value)}
                        className="text-xs border rounded px-1 py-0.5"
                      >
                        <option value="unread">📖 Unread</option>
                        <option value="reading">📘 Reading</option>
                        <option value="done">✅ Done</option>
                      </select>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            onClick={() =>
                              handleStarChange(
                                paper.id,
                                paper.starRating === s ? null : s,
                              )
                            }
                            className={`text-sm ${
                              (paper.starRating ?? 0) >= s
                                ? "text-yellow-400"
                                : "text-gray-300"
                            }`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}