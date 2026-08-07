/** 项目详情页：左侧文件浏览器（树内展开论文）+ 右侧 PDF 预览（F2/F3）。 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/api/projects";
import { getPaper, listPapers, movePaper, deletePaper } from "@/lib/api/papers";
import { getFolderTree, createFolder, deleteFolder } from "@/lib/api/folders";
import { PaperUploader } from "@/components/paper/PaperUploader";
import { PdfViewer } from "@/components/paper/PdfViewer";
import { Card } from "@/components/ui";
import type { Paper, PaperListItem, ResearchProject, Folder, ID } from "@/types";
import { formatDate } from "@/lib/utils";

/** 树节点 key："all" 表示根目录（All Papers），"f:{id}" 表示文件夹 */
const nodeKey = (folderId: ID | null) => (folderId === null ? "all" : `f:${folderId}`);

/** 节点 key 反解为 folderId（"all" → null） */
const keyToFolderId = (key: string): ID | null =>
  key === "all" ? null : Number(key.slice(2));

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [papersByNode, setPapersByNode] = useState<Record<string, PaperListItem[]>>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["all"]));
  const [selectedFolderId, setSelectedFolderId] = useState<ID | null>(null); // null = 根目录（上传目标）
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  // 拖拽中的论文（用 ref 避免 React 异步 state 导致 drop 时读不到）
  const dragPaperRef = useRef<{ paperId: ID; fromKey: string } | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const loadProject = async () => {
    const p = await getProject(projectId);
    setProject(p);
  };

  const loadFolders = async () => {
    const tree = await getFolderTree(projectId);
    setFolders(tree);
  };

  /** 加载某节点的论文列表（懒加载，已加载则跳过） */
  const loadNodePapers = useCallback(
    async (folderId: ID | null, force = false) => {
      const key = nodeKey(folderId);
      if (!force && papersByNode[key]) return;
      const page = await listPapers(projectId, folderId ?? undefined, 0, 100);
      setPapersByNode((prev) => ({ ...prev, [key]: page.items }));
    },
    [projectId, papersByNode],
  );

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(projectId, selectedFolderId ?? undefined, newFolderName.trim());
    setNewFolderName("");
    setShowNewFolder(false);
    await loadFolders();
  };

  /** 点击节点名：设置上传/新建文件夹目标 */
  const handleNodeClick = (folderId: ID | null) => {
    setSelectedFolderId(folderId);
  };

  /** 切换节点展开，首次展开时懒加载论文 */
  const toggleNode = (folderId: ID | null, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = nodeKey(folderId);
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        loadNodePapers(folderId);
      }
      return next;
    });
  };

  /** 点击论文：加载详情到右侧 */
  const handlePaperClick = async (paperId: ID) => {
    const p = await getPaper(paperId);
    setSelectedPaper(p);
  };

  // 上传完成后刷新当前节点论文
  const handleUploaded = () => {
    loadNodePapers(selectedFolderId, true);
  };

  /** 删除文件夹（连同其下所有子文件夹；文件夹内论文移回 All Papers） */
  const handleDeleteFolder = async (folderId: ID, name: string) => {
    if (
      !window.confirm(
        `确定删除文件夹「${name}」吗？\n子文件夹将一并删除，文件夹内的论文会移回 All Papers。`,
      )
    ) {
      return;
    }
    try {
      await deleteFolder(folderId);
      // 清理展开/选中状态中的已删除节点
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        next.delete(nodeKey(folderId));
        return next;
      });
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      await loadFolders();
    } catch {
      alert("删除文件夹失败，请重试");
    }
  };

  // 拖放论文到目标文件夹（null = 根目录 All Papers）
  const handleDrop = async (targetFolderId: ID | null) => {
    const drag = dragPaperRef.current;
    if (!drag) return;
    const { paperId, fromKey } = drag;
    const targetKey = nodeKey(targetFolderId);
    try {
      await movePaper(paperId, targetFolderId);
      loadNodePapers(keyToFolderId(fromKey), true);
      if (fromKey !== targetKey) loadNodePapers(targetFolderId, true);
    } catch {
      alert("移动论文失败，请重试");
    } finally {
      dragPaperRef.current = null;
      setDropTargetKey(null);
    }
  };

  // 递归渲染文件夹节点（可拖放论文到此）
  const renderFolder = (folder: Folder, level: number = 0) => {
    const key = nodeKey(folder.id);
    const isExpanded = expandedNodes.has(key);
    const isSelected = selectedFolderId === folder.id;
    const isDropTarget = dropTargetKey === key;
    const folderPapers = papersByNode[key] ?? [];

    return (
      <div
        key={folder.id}
        className="group"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropTargetKey(key);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDrop(folder.id);
        }}
      >
        <div
          className={`flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer text-sm ${
            isSelected
              ? "bg-blue-100 text-blue-800"
              : isDropTarget
                ? "bg-blue-50 ring-1 ring-blue-400"
                : "hover:bg-gray-100"
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleNodeClick(folder.id)}
        >
          <span
            className="w-4 h-4 flex items-center justify-center text-gray-500"
            onClick={(e) => toggleNode(folder.id, e)}
          >
            {isExpanded ? "▼" : "▶"}
          </span>
          <span>📁</span>
          <span className="truncate flex-1">{folder.name}</span>
          {/* 删除按钮：hover 行时显示，stopPropagation 避免触发选中/展开 */}
          <button
            type="button"
            title="删除文件夹"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteFolder(folder.id, folder.name);
            }}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 px-1"
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        {isExpanded && (
          <div>
            {folder.children?.map((child) => renderFolder(child, level + 1))}
            {renderPapers(folderPapers, level + 1, folder.id)}
          </div>
        )}
      </div>
    );
  };

  /** 删除论文（连同向量索引；确认后刷新所在节点列表） */
  const handleDeletePaper = async (
    paperId: ID,
    title: string,
    ownerFolderId: ID | null,
  ) => {
    if (!window.confirm(`确定删除论文「${title}」吗？\n删除后无法恢复。`)) {
      return;
    }
    try {
      await deletePaper(paperId);
      loadNodePapers(ownerFolderId, true);
      // 若右侧正预览该论文，清空选择
      setSelectedPaper((prev) => (prev?.id === paperId ? null : prev));
    } catch {
      alert("删除论文失败，请重试");
    }
  };

  // 渲染论文项（树内缩进显示，可拖拽到其他文件夹）
  const renderPapers = (
    papers: PaperListItem[],
    level: number,
    ownerFolderId: ID | null,
  ) => {
    if (!papers || papers.length === 0) return null;
    return (
      <div>
        {papers.map((paper) => (
          <div
            key={paper.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", String(paper.id));
              e.dataTransfer.effectAllowed = "move";
              dragPaperRef.current = {
                paperId: paper.id,
                fromKey: nodeKey(ownerFolderId),
              };
            }}
            onDragEnd={() => {
              dragPaperRef.current = null;
              setDropTargetKey(null);
            }}
            className={`group flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer text-sm ${
              selectedPaper?.id === paper.id
                ? "bg-blue-100 text-blue-800"
                : "hover:bg-gray-100"
            }`}
            style={{ paddingLeft: `${level * 16 + 24}px` }}
            onClick={() => handlePaperClick(paper.id)}
          >
            <span className="w-4" />
            <span>📄</span>
            <span className="truncate flex-1">{paper.title}</span>
            {/* 删除按钮：hover 行时显示，stopPropagation 避免触发论文选中/拖拽 */}
            <button
              type="button"
              title="删除论文"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                handleDeletePaper(paper.id, paper.title, ownerFolderId);
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 px-1"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          </div>
        ))}
      </div>
    );
  };

  // 初始加载：项目 + 文件夹树 + 根目录论文
  useEffect(() => {
    Promise.all([
      loadProject(),
      loadFolders(),
      loadNodePapers(null, true),
    ]).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!project) return <p>Project not found</p>;

  const rootPapers = papersByNode["all"] ?? [];
  const isRootExpanded = expandedNodes.has("all");

  // PDF 代理 URL
  const getPdfProxyUrl = (pdfUrl: string) => {
    if (!pdfUrl) return "";
    return `/api/files/${encodeURI(pdfUrl)}`;
  };

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
        {/* 左侧：文件浏览器（树内展开论文） */}
        <Card className="w-80 flex-shrink-0 p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="font-semibold text-gray-900 text-sm">Folders</h3>
            <div className="flex items-center gap-2">
              <PaperUploader
                compact
                projectId={projectId}
                folderId={selectedFolderId}
                onUploaded={handleUploaded}
              />
              <button
                onClick={() => setShowNewFolder(true)}
                className="whitespace-nowrap text-blue-600 hover:text-blue-800 text-xs"
              >
                New Folder
              </button>
            </div>
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

          {/* 树区域 */}
          <div className="flex-1 overflow-y-auto mt-1">
            {/* 根目录：All Papers（可展开） */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDropTargetKey("all");
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(null);
              }}
            >
              <div
                className={`flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer text-sm ${
                  selectedFolderId === null
                    ? "bg-blue-100 text-blue-800"
                    : dropTargetKey === "all"
                      ? "bg-blue-50 ring-1 ring-blue-400"
                      : "hover:bg-gray-100"
                }`}
                onClick={() => handleNodeClick(null)}
              >
                <span
                  className="w-4 h-4 flex items-center justify-center text-gray-500"
                  onClick={(e) => toggleNode(null, e)}
                >
                  {isRootExpanded ? "▼" : "▶"}
                </span>
                <span>📄</span>
                <span className="truncate">All Papers</span>
                <span className="text-xs text-gray-400">
                  ({rootPapers.length})
                </span>
              </div>
              {isRootExpanded && renderPapers(rootPapers, 0, null)}
            </div>

            {/* 文件夹树 */}
            <div className="mt-1">
              {folders.length === 0 ? (
                <p className="text-xs text-gray-400 px-2 py-1">
                  No folders yet.
                </p>
              ) : (
                folders.map((f) => renderFolder(f))
              )}
            </div>
          </div>
        </Card>

        {/* 右侧：论文详情 / PDF 预览 */}
        <Card className="flex-1 p-4 flex flex-col min-w-0 overflow-hidden">
          {selectedPaper ? (
            <>
              {/* 论文头部 */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">
                    {selectedPaper.title || "Untitled"}
                  </h2>
                  <p className="text-sm text-gray-500 truncate">
                    {selectedPaper.authors} · {selectedPaper.year} ·{" "}
                    {formatDate(selectedPaper.createdTime)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/papers/${selectedPaper.id}`}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Open Full Page
                  </Link>
                </div>
              </div>

              {/* 内容：PDF 预览（详细请打开完整页面） */}
              <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-gray-200">
                {selectedPaper.pdfUrl ? (
                  <PdfViewer pdfUrl={getPdfProxyUrl(selectedPaper.pdfUrl)} />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    No PDF available
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">
                在左侧选择一篇论文查看详情与预览。
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
