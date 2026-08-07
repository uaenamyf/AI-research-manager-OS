/**
 * 知识图谱组件测试。
 *
 * 3D 渲染（KnowledgeGraph3D）依赖 WebGL，jsdom 无法运行，
 * 测试中 mock 掉，仅验证包装层：空态引导、统计文案、3D 容器挂载。
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import KnowledgeGraph from "@/components/knowledge/KnowledgeGraph";
import type { KnowledgeGraph as KnowledgeGraphType } from "@/types";

// Mock 3D 子组件（jsdom 无 WebGL / three）
vi.mock("@/components/knowledge/KnowledgeGraph3D", () => ({
  default: ({ height }: { height?: number }) => (
    <div
      role="img"
      aria-label="论文关联知识图谱 3D：tag 中心恒星环绕图"
      style={{ height: height ?? 520, width: "100%" }}
    />
  ),
}));

const SAMPLE_GRAPH: KnowledgeGraphType = {
  nodes: [
    {
      id: 1,
      title: "Attention Is All You Need",
      authors: "Vaswani et al.",
      tags: ["Transformers"],
    },
    {
      id: 2,
      title: "BERT: Pre-training of Deep Transformers",
      authors: "Devlin et al.",
      tags: ["NLP"],
    },
    {
      id: 3,
      title: "A Survey on Quantum Computing",
      authors: "Preskill",
      tags: ["Quantum"],
    },
  ],
  links: [
    { source: 1, target: 2, weight: 0.83, reason: "semantic" },
    { source: 1, target: 3, weight: 0.4, reason: "semantic" },
  ],
};

describe("KnowledgeGraph 组件", () => {
  it("空图谱渲染空状态引导", () => {
    render(<KnowledgeGraph graph={{ nodes: [], links: [] }} />);
    expect(screen.getByText(/No papers yet/i)).toBeDefined();
  });

  it("有节点时挂载 3D 容器", () => {
    render(<KnowledgeGraph graph={SAMPLE_GRAPH} />);
    const el = document.querySelector(
      "div[aria-label*='论文关联知识图谱 3D']",
    );
    expect(el).not.toBeNull();
  });

  it("边数与节点数统计文案", () => {
    render(<KnowledgeGraph graph={SAMPLE_GRAPH} />);
    expect(screen.getByText(/3 papers · 2 links/i)).toBeDefined();
  });

  it("无边的图提示暂无关联", () => {
    render(
      <KnowledgeGraph
        graph={{ nodes: SAMPLE_GRAPH.nodes, links: [] }}
      />,
    );
    expect(screen.getByText(/no links yet/i)).toBeDefined();
  });
});
