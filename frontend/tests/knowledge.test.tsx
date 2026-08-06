/**
 * 知识图谱组件测试。
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import KnowledgeGraph from "@/components/knowledge/KnowledgeGraph";
import type { KnowledgeGraph as KnowledgeGraphType } from "@/types";

// Mock next/link（测试环境无路由）
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
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
    expect(
      screen.getByText(/No papers yet/i),
    ).toBeDefined();
  });

  it("有节点时渲染 SVG 力导向图", () => {
    render(<KnowledgeGraph graph={SAMPLE_GRAPH} />);
    const svg = document.querySelector("svg[aria-label*='论文关联知识图谱']");
    expect(svg).not.toBeNull();
    // 3 个节点 + 2 条连线
    expect(document.querySelectorAll("line").length).toBe(2);
    expect(document.querySelectorAll("circle").length).toBe(6); // 每节点 halo+主体
    // 论文标题渲染在图中（超长标题被截断）
    expect(screen.getAllByText(/Attention Is All You/).length).toBeGreaterThan(0);
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
