/** 项目详情页：文件夹树 + 文件列表双面板（F2/F3）。 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/api/projects";
import { listPapers } from "@/lib/api/papers";
import { getFolderTree, createFolder } from "@/lib/api/folders";
import { PaperUploader } from "@/components/paper/PaperUploader";
import { PaperStatusBadge } from "@/components/paper/PaperStatusBadge";
import { Card } from "@/components/ui";
import type { PaperListItem, ResearchProject, Folder, ID } from "@/types";
import { formatDate } from "@/lib/utils";

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<ID | null>(null); // null = 根目录
  const [expandedFolders, setExpandedFolders] = useState<Set<ID>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const loadProject = async () => {
    const p = await getProject(projectId);
    setProject(p);
  };

  const loadFolders = async () => {
    const tree = await getFolderTree(projectId);
    setFolders(tree);
  };

  const loadPapers = async (folderId: ID | null) => {
    const page = await listPapers(projectId, folderId, 0, 100);
    setPapers(page.items);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(projectId, selectedFolderId, newFolderName.trim());
    setNewFolderName("");
    setShowNewFolder(false);
    await loadFolders();
  };

  const handleFolderClick = (folderId: ID | null) => {
    setSelectedFolderId(folderId);
    loadPapers(folderId);
  };

  const toggleExpand = (folderId: ID, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // 递归渲染文件夹树
  const renderFolder = (folder: Folder, level: number = 0) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer text-sm ${
            isSelected ? "bg-blue-100 text-blue-800" : "hover:bg-gray-100"
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleFolderClick(folder.id)}
        >
          {hasChildren ? (
            <span
              className="w-4 h-4 flex items-center justify-center text-gray-500"
              onClick={(e) => toggleExpand(folder.id, e)}
            >
              {isExpanded ? "▼" : "▶"}
            </span>
          ) : (
            <span className="w-4" />
          )}
          <span>📁</span>
          <span className="truncate">{folder.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {folder.children!.map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // 初始加载
  useEffect(() => {
    Promise.all([loadProject(), loadFolders(), loadPapers(null)]).finally(() =>
      setLoading(false),
    );
  }, [projectId]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!project) return <p>Project not found</p>;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        <p className="text-sm text-gray-500">
          {project.domain} · {formatDate(project.createdTime)}
        </p>
        {project.description && (
          <p className="mt-2 text-sm text-gray-600">{project.description}</p>
        )}
      </div>

      {/* 双面板内容区 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 左侧：文件夹树 */}
        <Card className="w-64 flex-shrink-0 p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 text-sm">Folders</h3>
            <button
              onClick={() => setShowNewFolder(true)}
              className="text-blue-600 hover:text-blue-800 text-xs"
            >
              + New
            </button>
          </div>

          {/* 新建文件夹输入 */}
          {showNewFolder && (
            <div className="mb-2 flex gap-1">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                placeholder="Folder name"
                className="flex-1 px-2 py-1 text-sm border rounded"
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }}
                className="px-2 py-1 text-xs text-gray-500 rounded"
              >
                ✕
              </button>
            </div>
          )}

          {/* 根目录 */}
          <div
            className={`flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer text-sm ${
              selectedFolderId === null ? "bg-blue-100 text-blue-800" : "hover:bg-gray-100"
            }`}
            onClick={() => handleFolderClick(null)}
          >
            <span className="w-4" />
            <span>📄</span>
            <span>All Papers</span>
          </div>

          {/* 文件夹树 */}
          <div className="flex-1 overflow-y-auto mt-1">
            {folders.length === 0 ? (
              <p className="text-xs text-gray-400 px-2 py-1">
                No folders yet.
              </p>
            ) : (
              folders.map((f) => renderFolder(f))
            )}
          </div>
        </Card>

        {/* 右侧：文件列表 */}
        <Card className="flex-1 p-4 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">
              {selectedFolderId === null ? "All Papers" : "Papers"} ({papers.length})
            </h2>
            <PaperUploader
              projectId={projectId}
              folderId={selectedFolderId}
              onUploaded={() => loadPapers(selectedFolderId)}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {papers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No papers here. Upload your first PDF.
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
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {paper.title}
                      </span>
                      <PaperStatusBadge status={paper.status} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {paper.authors} · {formatDate(paper.createdTime)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
