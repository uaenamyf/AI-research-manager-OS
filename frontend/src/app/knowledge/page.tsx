/** Knowledge Base：标签 + 关联搜索 + 知识图谱（F6）。 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listTags, searchKnowledge, getKnowledgeGraph } from "@/lib/api/knowledge";
import { Card, Input, Badge } from "@/components/ui";
import KnowledgeGraph from "@/components/knowledge/KnowledgeGraph";
import type {
  KnowledgeGraph as KnowledgeGraphType,
  KnowledgeSearchResult,
  KnowledgeTag,
} from "@/types";

type KnowledgeTab = "tags" | "search" | "graph";

const TABS: { value: KnowledgeTab; label: string }[] = [
  { value: "tags", label: "Tags" },
  { value: "search", label: "Search" },
  { value: "graph", label: "Graph" },
];

export default function KnowledgePage() {
  const [tab, setTab] = useState<KnowledgeTab>("tags");
  const [tags, setTags] = useState<KnowledgeTag[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [graph, setGraph] = useState<KnowledgeGraphType>({ nodes: [], links: [] });
  const [graphLoading, setGraphLoading] = useState(false);

  useEffect(() => {
    listTags().then(setTags).catch(() => {});
  }, []);

  // 进入 Graph Tab 时加载一次图谱
  useEffect(() => {
    if (tab !== "graph" || graph.nodes.length > 0) return;
    setGraphLoading(true);
    getKnowledgeGraph()
      .then(setGraph)
      .catch(() => {})
      .finally(() => setGraphLoading(false));
  }, [tab, graph.nodes.length]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchKnowledge(query);
      setResults(res);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Research Knowledge Base
      </h1>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={
              tab === t.value
                ? "rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                : "rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "tags" && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-gray-900">Tags</h2>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <p className="text-sm text-gray-500">
              No tags yet. Upload papers to auto-generate tags.
            </p>
          ) : (
            tags.map((tag) => (
              <Badge
                key={tag.id}
                className="bg-gray-100 text-gray-700"
              >
                {tag.name} ({tag.count})
              </Badge>
            ))
          )}
        </div>
      </Card>
      )}

      {tab === "search" && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-gray-900">Search</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Find papers related to individual recognition"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((r) => (
              <Link
                key={r.paperId}
                href={`/papers/${r.paperId}`}
                className="block rounded-md border border-gray-100 p-3 hover:bg-gray-50"
              >
                <p className="text-sm font-medium text-gray-900">
                  {r.title}
                </p>
                <p className="text-xs text-gray-500">{r.authors}</p>
                <p className="mt-1 text-xs text-gray-600">{r.snippet}</p>
                <div className="mt-1 flex gap-1">
                  {r.tags.map((t) => (
                    <Badge
                      key={t}
                      className="bg-gray-50 text-xs text-gray-500"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
      )}

      {tab === "graph" && (
        <Card className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold text-gray-900">Paper Graph</h2>
            <span className="text-xs text-gray-400">
              Auto-linked by embedding similarity
            </span>
          </div>
          {graphLoading ? (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-gray-500">Building graph…</p>
            </div>
          ) : (
            <KnowledgeGraph graph={graph} />
          )}
        </Card>
      )}
    </div>
  );
}
