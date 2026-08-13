/**
 * KnowledgeGraph3D：论文关联网络 3D 可视化（three.js + 3d-force-graph）。
 *
 * - 恒星环绕式：tag 作为金色中心节点，其下论文通过边连接成星群
 * - 自动旋转（autoRotate），节点大小编码关联度，连线粗细编码权重
 * - 点击论文节点跳转详情页；点击 tag 节点高亮其下属论文
 * - 客户端动态 import（3d-force-graph 依赖 window，避免 SSR 报错）
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { ForceGraph3DInstance } from "3d-force-graph";
import { toTitleCase } from "@/lib/utils";
import type { GraphLink, KnowledgeGraph } from "@/types";

/** 3D 渲染用节点：论文节点保持数字 id，tag 中心节点用字符串 id。 */
interface ViewNode {
  id: number | string;
  title: string;
  authors: string;
  tags: string[];
  /** tag 中心节点标记 */
  isTag?: boolean;
  /** 节点连接度（tag 节点 = 旗下论文数） */
  degree: number;
}

/** 3D 渲染用边：端点可以是论文 id 或 tag 节点 id。 */
interface ViewLink {
  source: number | string;
  target: number | string;
  weight: number;
  reason: GraphLink["reason"];
}

interface ViewGraph {
  nodes: ViewNode[];
  links: ViewLink[];
}

/**
 * 合成「tag 中心 + 论文环绕」图结构：
 * 每个论文 tag 生成一个金色中心节点，用边连到该 tag 下的所有论文。
 */
function buildSolarGraph(graph: KnowledgeGraph): ViewGraph {
  // tag(小写) -> 论文 id 列表
  const tagToPapers = new Map<string, number[]>();
  for (const n of graph.nodes) {
    for (const t of n.tags) {
      const key = t.trim().toLowerCase();
      if (!key) continue;
      const list = tagToPapers.get(key) ?? [];
      list.push(n.id);
      tagToPapers.set(key, list);
    }
  }

  // 论文节点：连接度统计
  const degreeMap = new Map<number | string, number>();
  for (const l of graph.links) {
    degreeMap.set(l.source, (degreeMap.get(l.source) ?? 0) + 1);
    degreeMap.set(l.target, (degreeMap.get(l.target) ?? 0) + 1);
  }

  const nodes: ViewNode[] = graph.nodes.map((n) => ({
    ...n,
    degree: degreeMap.get(n.id) ?? 0,
  }));

  // tag 中心节点（字符串 id，避免与论文数字 id 冲突）
  for (const [key, paperIds] of tagToPapers) {
    if (paperIds.length === 0) continue;
    nodes.push({
      id: `tag:${key}`,
      title: toTitleCase(key),
      authors: "",
      tags: [key],
      isTag: true,
      degree: paperIds.length,
    });
  }

  const links: ViewLink[] = [
    // 原有论文-论文边（semantic / tag）
    ...graph.links.map((l) => ({
      source: l.source,
      target: l.target,
      weight: l.weight,
      reason: l.reason,
    })),
    // tag 中心 -> 旗下论文边（构成恒星环绕星群）
    ...[...tagToPapers.entries()].flatMap(([key, paperIds]) =>
      paperIds.map((pid) => ({
        source: `tag:${key}`,
        target: pid,
        weight: 1,
        reason: "tag" as const,
      })),
    ),
  ];

  return { nodes, links };
}

/** 截断超长标题。 */
function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * 生成常驻文字标签 Sprite（CanvasTexture）。
 * 圆角深色底 + 文字，常显在节点旁，无需 hover。
 */
function makeLabelSprite(
  THREE: typeof import("three"),
  text: string,
  opts: { color?: string; bg?: string } = {},
): import("three").Sprite {
  const fontSize = 30;
  const color = opts.color ?? "#e2e8f0";
  const bg = opts.bg ?? "rgba(15, 23, 42, 0.82)";

  const canvas = document.createElement("canvas");
  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) return new THREE.Sprite();
  measureCtx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  const textWidth = measureCtx.measureText(text).width;

  const padX = 16;
  const padY = 10;
  canvas.width = Math.max(1, Math.ceil(textWidth + padX * 2));
  canvas.height = Math.ceil(fontSize + padY * 2);

  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Sprite();
  ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 圆角矩形背景
  const radius = Math.min(10, canvas.height / 2);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(canvas.width - radius, 0, canvas.width - radius, radius, radius);
  ctx.arcTo(canvas.width, radius, canvas.width, canvas.height - radius, radius);
  ctx.arcTo(canvas.width - radius, canvas.height, radius, canvas.height, radius);
  ctx.arcTo(0, canvas.height - radius, 0, radius, radius);
  ctx.closePath();
  ctx.fill();

  // 文字
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  // 标签世界高度约 8 单位，宽度按画布比例缩放
  const worldHeight = 8;
  sprite.scale.set((canvas.width / canvas.height) * worldHeight, worldHeight, 1);
  sprite.center.set(0.5, 0.5);
  return sprite;
}

/**
 * 构建恒星/行星 3D 对象：球体 + 常驻文字标签。
 * tag 节点显示 tag 名（金色），论文节点显示截断标题（浅色）。
 */
function buildNodeObject(
  THREE: typeof import("three"),
  n: ViewNode,
): import("three").Group {
  const radius = n.isTag ? 8 + n.degree * 1.2 : 3 + n.degree * 0.9;
  const color = n.isTag ? "#fbbf24" : n.degree >= 3 ? "#60a5fa" : "#94a3b8";

  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 24),
    new THREE.MeshPhongMaterial({
      color,
      emissive: n.isTag ? 0x8a6400 : 0x000000,
      emissiveIntensity: n.isTag ? 0.45 : 0,
    }),
  );
  group.add(sphere);

  // 常驻标签：tag 显示 tag 名，论文显示截断标题
  const labelText = n.isTag ? n.title : truncate(n.title, 16);
  if (labelText) {
    const label = makeLabelSprite(THREE, labelText, {
      color: n.isTag ? "#fbbf24" : "#cbd5e1",
    });
    label.position.set(0, radius + 7, 0);
    group.add(label);
  }

  return group;
}

export default function KnowledgeGraph3D({
  graph,
  height = 520,
}: {
  graph: KnowledgeGraph;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let destroy: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        // 动态 import：3d-force-graph 与 three 均依赖 window，仅客户端加载
        const [{ default: ForceGraph3DDefault }, THREE] = await Promise.all([
          import("3d-force-graph"),
          import("three"),
        ]);
        const ForceGraph3D = ForceGraph3DDefault as unknown as (
          config?: unknown,
        ) => (el: HTMLElement) => ForceGraph3DInstance;

        if (cancelled) return;

        // 构建恒星环绕图数据
        const view = buildSolarGraph(graph);

        // controlType: 'orbit' -> 内部使用 OrbitControls（支持 autoRotate）
        const fg = ForceGraph3D({ controlType: "orbit" })(el);
        fg.width(el.clientWidth || 720)
          .height(height)
          // 恒星环绕图只需旋转视角，禁用节点拖拽（避免 DragControls 与 OrbitControls 的 pointercancel 冲突报错）
          .enableNodeDrag(false)
          .backgroundColor("#0b1020")
          // nodeVal 仍用于模拟碰撞半径；渲染由 nodeThreeObject 定制（球体 + 常驻标签）
          .nodeVal((n: ViewNode) => (n.isTag ? 14 + n.degree * 2 : 5 + n.degree * 1.6))
          .nodeThreeObject((n: ViewNode) => buildNodeObject(THREE, n))
          .nodeLabel((n: ViewNode) => nodeLabelHtml(n))
          .linkWidth((l: ViewLink) =>
            l.source.toString().startsWith("tag:") || l.target.toString().startsWith("tag:")
              ? 1.1
              : 0.4 + Math.min(Math.max(l.weight, 0), 1) * 0.8,
          )
          .linkColor((l: ViewLink) =>
            l.source.toString().startsWith("tag:") || l.target.toString().startsWith("tag:")
              ? "rgba(251, 191, 36, 0.45)"
              : "rgba(148, 163, 184, 0.35)",
          )
          .linkDirectionalParticles(1)
          .linkDirectionalParticleWidth(1.4)
          .linkDirectionalParticleSpeed(0.003)
          .cooldownTicks(120)
          .cooldownTime(4000)
          .onNodeClick((n: ViewNode) => {
            if (n.isTag) return;
            window.location.href = `/papers/${n.id}`;
          })
          .onNodeHover((n: ViewNode | null) => {
            // 光标变手型（仅论文节点可点击）
            if (el) el.style.cursor = n && !n.isTag ? "pointer" : "grab";
          })
          .cameraPosition({ x: 0, y: 0, z: 260 }, { x: 0, y: 0, z: 0 }, 0);

        // 恒星环绕：OrbitControls 自动旋转（autoRotate 是其属性，非 fg 方法）
        const controls = fg.controls() as {
          autoRotate?: boolean;
          autoRotateSpeed?: number;
        } | null;
        if (controls) {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.6;
        }

        fg.graphData(view);
        destroy = () => {
          try {
            fg._destructor();
          } catch {
            /* 销毁异常忽略 */
          }
        };
      } catch (e) {
        if (!cancelled) {
          console.error("3D graph init failed:", e);
          setWebglError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
      // 清理容器内残留 canvas
      el.replaceChildren();
    };
  }, [graph, height]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%" }}
      role="img"
      aria-label="Paper knowledge graph 3D: tag-centered star field"
      className="overflow-hidden rounded-lg"
    >
      {webglError && (
        <div className="flex h-full items-center justify-center">
          <p className="max-w-sm text-center text-sm text-gray-400">
            {`3D graph failed to initialize (${webglError}). Please use a browser with WebGL support.`}
          </p>
        </div>
      )}
    </div>
  );
}

/** 节点 hover 悬浮卡（HTML 字符串，3d-force-graph 渲染为 tooltip）。 */
function nodeLabelHtml(n: ViewNode): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (n.isTag) {
    return `<div style="padding:6px 10px;background:rgba(15,23,42,0.92);color:#fbbf24;border-radius:8px;font-size:12px;white-space:nowrap">
      ⭐ <b>${esc(n.title)}</b> · ${n.degree} paper${n.degree === 1 ? "" : "s"}
    </div>`;
  }
  const tagHtml = n.tags
    .slice(0, 4)
    .map((t) => `<span style="margin-right:4px;color:#93c5fd">#${esc(toTitleCase(t))}</span>`)
    .join("");
  return `<div style="padding:8px 12px;background:rgba(15,23,42,0.94);color:#e2e8f0;border-radius:8px;font-size:12px;max-width:280px;line-height:1.5">
    <div style="font-weight:600;color:#fff">${esc(n.title)}</div>
    ${n.authors ? `<div style="color:#94a3b8;font-size:11px">${esc(n.authors)}</div>` : ""}
    <div style="margin-top:4px">${tagHtml}</div>
  </div>`;
}
