/**
 * Library 主工作区：合并 project 功能，简洁美观。
 */
"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listProjects } from "@/lib/api/projects";
import { listPapers, getPaper, movePaper, updateReadingStatus } from "@/lib/api/papers";
import { getFolderTree, createFolder, deleteFolder } from "@/lib/api/folders";
import { exportBibtexBatch, exportRisBatch } from "@/lib/api/export";
import { PaperCard } from "@/components/paper/PaperCard";
import { PaperUploader } from "@/components/paper/PaperUploader";
import { PaperStatusBadge } from "@/components/paper/PaperStatusBadge";
import { Card } from "@/components/ui";
import dynamic from "next/dynamic";
import type { Paper, PaperListItem, ResearchProject, Folder, ID } from "@/types";

const PdfViewer = dynamic(
  () => import("@/components/paper/PdfViewer").then((m) => m.PdfViewer),
  { ssr: false },
);

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-gray-400">Loading...</div>}>
      <LibraryContent />
    </Suspense>
  );
}

function LibraryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ID | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<ID | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [moveFolderId, setMoveFolderId] = useState<string>("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const folderInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showNewFolder) return;
    const handleClick = (e: MouseEvent) => {
      if (folderInputRef.current && !folderInputRef.current.contains(e.target as Node)) {
        setShowNewFolder(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNewFolder]);

  useEffect(() => {
    listProjects(0, 50).then((p) => {
      setProjects(p.items);
      const paramId = searchParams.get("projectId");
      setSelectedProject(paramId ? Number(paramId) : p.items[0]?.id ?? null);
    });
  }, [searchParams]);

  useEffect(() => {
    if (!selectedProject) return;
    getFolderTree(selectedProject).then(setFolders);
    loadPapers(selectedProject, null);
    setSelectedPaper(null);
    setSelectedFolderId(null);
  }, [selectedProject]);

  const loadPapers = (projectId: ID, folderId: ID | null) => {
    listPapers(projectId, folderId ?? undefined, 0, 200).then((p) =>
      setPapers(p.items),
    );
  };

  const handleFolderClick = (folderId: ID | null) => {
    setSelectedFolderId(folderId);
    if (selectedProject) loadPapers(selectedProject, folderId);
  };

  const handlePaperClick = async (paperId: number) => {
    const paper = await getPaper(paperId);
    setSelectedPaper(paper);
  };

  const handleUploaded = () => {
    if (selectedProject) loadPapers(selectedProject, selectedFolderId);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !selectedProject) return;
    await createFolder(selectedProject, selectedFolderId ?? undefined, newFolderName.trim());
    setNewFolderName("");
    setShowNewFolder(false);
    getFolderTree(selectedProject).then(setFolders);
  };

  const handleMoveSelected = async () => {
    if (!moveFolderId) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await movePaper(id, moveFolderId === "root" ? null : Number(moveFolderId));
    }
    setSelectedIds(new Set());
    setMoveFolderId("");
    loadPapers(selectedProject!, selectedFolderId);
  };

  const handleStatus = async (paperId: number, status: string) => {
    await updateReadingStatus(paperId, { readingStatus: status });
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paperId ? { ...p, readingStatus: status as any } : p,
      ),
    );
  };

  const filteredPapers = (searchQuery
    ? papers.filter((p) =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : papers
  ).filter((p) => {
    if (statusFilter === "all") return true;
    return (p.readingStatus || "unread") === statusFilter;
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-4">
      {/* 左侧：项目 + 文件夹 + 论文列表 */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedProject ?? ""}
            onChange={(e) => setSelectedProject(Number(e.target.value))}
            className="h-9 flex-1 rounded border border-gray-300 px-2 text-sm bg-white"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <PaperUploader
            compact
            projectId={selectedProject ?? 0}
            folderId={selectedFolderId}
            onUploaded={handleUploaded}
          />
        </div>

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search papers..."
          className="h-9 w-full rounded border border-gray-300 px-3 text-sm"
        />

        <div className="flex items-center gap-1 text-sm">
          <span className="text-xs text-gray-400 mr-1">Status:</span>
          {[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread" },
            { value: "reading", label: "Reading" },
            { value: "done", label: "Done" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-2 py-1 rounded ${
                statusFilter === f.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
          <span className="text-xs text-gray-400">Folder:</span>
          <button
            onClick={() => handleFolderClick(null)}
            className={`px-2 py-1 rounded ${
              selectedFolderId === null ? "bg-gray-900 text-white" : "hover:bg-gray-100"
            }`}
          >
            All
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => handleFolderClick(f.id)}
              className={`px-2 py-1 rounded ${
                selectedFolderId === f.id ? "bg-gray-900 text-white" : "hover:bg-gray-100"
              }`}
            >
              {f.name}
            </button>
          ))}
          <button
            onClick={() => setShowNewFolder(!showNewFolder)}
            className="text-gray-400 hover:text-gray-600 px-1 text-lg leading-none"
            title="New folder"
          >
            +
          </button>
        </div>
        {showNewFolder && (
          <div ref={folderInputRef} className="flex gap-1">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              placeholder="Folder name"
              className="flex-1 px-2 py-1 text-sm border rounded"
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              className="px-2 py-1 text-sm bg-gray-900 text-white rounded"
            >
              Add
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-0.5">
          {filteredPapers.length === 0 ? (
            <p className="text-sm text-gray-400 pt-4 text-center">No papers</p>
          ) : (
            filteredPapers.map((paper) => (
              <div
                key={paper.id}
                onClick={() => handlePaperClick(paper.id)}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
                  selectedPaper?.id === paper.id
                    ? "bg-gray-100"
                    : "hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(paper.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSelect(paper.id);
                  }}
                  className="shrink-0"
                />
                <span className="truncate flex-1">{paper.title}</span>
                </div>
            ))
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 text-xs border-t border-gray-200 pt-2">
            <span className="text-gray-500">{selectedIds.size} selected</span>
            <select
              value={moveFolderId}
              onChange={(e) => setMoveFolderId(e.target.value)}
              className="text-xs border rounded px-1 py-0.5"
            >
              <option value="">Move to...</option>
              <option value="root">Root</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {moveFolderId && (
              <button onClick={handleMoveSelected} className="text-blue-600 hover:underline">
                Go
              </button>
            )}
            <button
              onClick={() => {
                exportBibtexBatch(Array.from(selectedIds)).then((r) =>
                  navigator.clipboard.writeText(r.bibtex),
                );
              }}
              className="text-blue-600 hover:underline"
            >
              Copy BibTeX
            </button>
            <button
              onClick={() => {
                exportRisBatch(Array.from(selectedIds)).then((r) =>
                  navigator.clipboard.writeText(r.ris),
                );
              }}
              className="text-blue-600 hover:underline"
            >
              Copy RIS
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-gray-400 hover:underline"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* 右侧：PDF 预览 + 信息 */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {selectedPaper ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  {selectedPaper.title || "Untitled"}
                </h1>
                <p className="text-sm text-gray-500">
                  {[selectedPaper.authors, selectedPaper.year].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PaperStatusBadge status={selectedPaper.status} />
                <select
                  value={selectedPaper.readingStatus || "unread"}
                  onChange={(e) => {
                    handleStatus(selectedPaper.id, e.target.value);
                    setSelectedPaper((p) => (p ? { ...p, readingStatus: e.target.value as any } : null));
                  }}
                  className="text-xs border rounded px-1 py-0.5"
                >
                  <option value="unread">Unread</option>
                  <option value="reading">Reading</option>
                  <option value="done">Done</option>
                </select>

              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
              <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                {selectedPaper.pdfUrl ? (
                  <PdfViewer pdfKey={selectedPaper.pdfUrl} />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400 text-sm">
                    No PDF
                  </div>
                )}
              </div>
              <div className="overflow-y-auto">
                {selectedPaper.summary && <PaperCard card={selectedPaper.summary} />}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            Select a paper to view
          </div>
        )}
      </div>
    </div>
  );
}