/**
 * KnowledgeGraph：论文关联网络可视化（SVG 力导向图）。
 *
 * - 节点大小编码连接度（degree），连线粗细编码相似度（weight）
 * - hover 高亮邻域，点击节点跳转论文详情
 * - 布局用 d3-force 同步 tick 计算（无动画、无异步，渲染一次）
 */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as d3 from "d3-force";
import type { GraphLink, GraphNode, KnowledgeGraph } from "@/types";

const WIDTH = 760;
const HEIGHT = 460;

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  degree: number;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
  weight: number;
  reason: GraphLink["reason"];
}

/** 根据连接度映射节点半径（3 条边以上封顶）。 */
function radius(degree: number): number {
  return 9 + Math.min(degree, 6) * 2.2;
}

export default function KnowledgeGraph({ graph }: { graph: KnowledgeGraph }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [links, setLinks] = useState<LayoutLink[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    if (graph.nodes.length === 0) return;

    // 连接度统计
    const degree = new Map<number, number>();
    for (const l of graph.links) {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    }

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const layoutNodes: LayoutNode[] = graph.nodes.map((n) => ({
      ...n,
      x: WIDTH / 2 + (Math.random() - 0.5) * 160,
      y: HEIGHT / 2 + (Math.random() - 0.5) * 160,
      degree: degree.get(n.id) ?? 0,
    }));
    const layoutLinks: LayoutLink[] = graph.links
      .map((l) => ({
        source: byId.get(l.source),
        target: byId.get(l.target),
        weight: l.weight,
        reason: l.reason,
      }))
      .filter(
        (l): l is LayoutLink =>
          l.source !== undefined && l.target !== undefined,
      )
      .map((l) => ({
        ...l,
        source: l.source as unknown as LayoutNode,
        target: l.target as unknown as LayoutNode,
      }));

    // 同步计算力导向布局（固定 300 tick 收敛）
    const simulation = d3
      .forceSimulation(layoutNodes)
      .force(
        "link",
        d3
          .forceLink(layoutLinks)
          .id((d: { id: number }) => d.id)
          .distance(110),
      )
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", d3.forceCollide().radius(36))
      .stop();
    for (let i = 0; i < 300; i++) simulation.tick();
    simulation.stop();

    setNodes([...layoutNodes]);
    setLinks([...layoutLinks]);
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-200">
        <p className="text-sm text-gray-500">
          No papers yet — upload and analyze papers to reveal how they connect.
        </p>
      </div>
    );
  }

  // hover 邻域：节点自身 + 直接相连的节点
  const neighbors = new Set<number>();
  if (hoveredId !== null) {
    neighbors.add(hoveredId);
    for (const l of links) {
      if (l.source.id === hoveredId) neighbors.add(l.target.id);
      if (l.target.id === hoveredId) neighbors.add(l.source.id);
    }
  }

  const hoveredNode = nodes.find((n) => n.id === hoveredId) ?? null;

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-gray-100">
        <svg
          ref={svgRef}
          role="img"
          aria-label="论文关联知识图谱：节点为论文，连线表示语义关联"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full bg-white"
        >
          {/* 连线：粗细与透明度编码相似度 */}
          {links.map((l, i) => {
            const dimmed = hoveredId !== null && !neighbors.has(l.source.id) && !neighbors.has(l.target.id);
            const active = hoveredId !== null && (l.source.id === hoveredId || l.target.id === hoveredId);
            return (
              <line
                key={`${l.source.id}-${l.target.id}-${i}`}
                x1={l.source.x}
                y1={l.source.y}
                x2={l.target.x}
                y2={l.target.y}
                stroke={active ? "#4f46e5" : "#cbd5e1"}
                strokeOpacity={
                  dimmed ? 0.08 : 0.25 + Math.min(Math.max(l.weight, 0), 1) * 0.55
                }
                strokeWidth={0.6 + Math.min(Math.max(l.weight, 0), 1) * 1.6}
              />
            );
          })}

          {/* 节点：半径编码连接度 */}
          {nodes.map((n) => {
            const r = radius(n.degree);
            const dimmed = hoveredId !== null && !neighbors.has(n.id);
            return (
              <Link
                key={n.id}
                href={`/papers/${n.id}`}
                className="cursor-pointer"
              >
                <g
                  transform={`translate(${n.x},${n.y})`}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <circle
                    r={r + 3}
                    fill={n.id === hoveredId ? "#4f46e5" : "transparent"}
                    fillOpacity={0.12}
                  />
                  <circle
                    r={r}
                    fill={n.id === hoveredId ? "#4f46e5" : "#1e293b"}
                    fillOpacity={dimmed ? 0.25 : 0.9}
                    stroke="#f8fafc"
                    strokeWidth={1.5}
                  />
                  <text
                    dy={-r - 6}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill={dimmed ? "#cbd5e1" : "#334155"}
                    className="pointer-events-none select-none"
                  >
                    {truncate(n.title, 24)}
                  </text>
                </g>
              </Link>
            );
          })}
        </svg>

        {/* hover 详情浮层 */}
        {hoveredNode && (
          <div className="pointer-events-none absolute left-4 top-4 max-w-xs rounded-md border border-gray-100 bg-white/95 p-3 shadow-lg">
            <p className="text-sm font-semibold text-gray-900">
              {hoveredNode.title}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{hoveredNode.authors}</p>
            {hoveredNode.tags.length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-1">
                {hoveredNode.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                  >
                    {t}
                  </span>
                ))}
              </p>
            )}
            <p className="mt-1.5 text-[10px] text-gray-400">
              {hoveredNode.degree} connection{hoveredNode.degree === 1 ? "" : "s"} · click to open
            </p>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-400">
        {links.length > 0
          ? `${nodes.length} papers · ${links.length} links · node size = relatedness, line weight = similarity`
          : `${nodes.length} papers — no links yet, analyze more papers to reveal connections`}
      </p>
    </div>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}
