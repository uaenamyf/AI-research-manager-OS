/**
 * KnowledgeGraph：论文关联网络可视化。
 *
 * - 3D 恒星环绕图（tag 中心节点 + 论文环绕，自动旋转）
 * - 空态引导 + 统计文案
 * - 具体 3D 渲染逻辑见 KnowledgeGraph3D.tsx
 */
"use client";

import KnowledgeGraph3D from "./KnowledgeGraph3D";
import type { KnowledgeGraph as KnowledgeGraphType } from "@/types";

export default function KnowledgeGraph({
  graph,
}: {
  graph: KnowledgeGraphType;
}) {
  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-200">
        <p className="text-sm text-gray-500">
          No papers yet — upload and analyze papers to reveal how they connect.
        </p>
      </div>
    );
  }

  return (
    <div>
      <KnowledgeGraph3D graph={graph} />
      <p className="mt-2 text-xs text-gray-400">
        {graph.links.length > 0
          ? `${graph.nodes.length} papers · ${graph.links.length} links · drag to explore, scroll to zoom, click a paper to open`
          : `${graph.nodes.length} papers — no links yet, analyze more papers to reveal connections`}
      </p>
    </div>
  );
}
