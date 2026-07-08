/** Knowledge Base：标签 + 关联搜索（F6）。 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listTags, searchKnowledge } from "@/lib/api/knowledge";
import { Card, Input, Badge } from "@/components/ui";
import type { KnowledgeSearchResult, KnowledgeTag } from "@/types";

export default function KnowledgePage() {
  const [tags, setTags] = useState<KnowledgeTag[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    listTags().then(setTags).catch(() => {});
  }, []);

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
    </div>
  );
}
