/** Paper Intelligence Card 展示组件：Intelligence + 划词翻译双 Tab。 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PaperIntelligenceCard } from "@/types";
import { rewriteText } from "@/lib/api/writing";
import { Button, Spinner } from "@/components/ui";
import { CardField } from "./CardField";

type TabKey = "intelligence" | "translate";

export function PaperCard({
  card,
  selectedText = "",
}: {
  card?: PaperIntelligenceCard;
  selectedText?: string;
}) {
  const [tab, setTab] = useState<TabKey>("intelligence");
  const [translated, setTranslated] = useState("");
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doTranslate = useCallback(async (text: string) => {
    setTranslating(true);
    setError("");
    try {
      const res = await rewriteText({
        text,
        action: "translate",
        instruction: "翻译成简体中文，保持学术术语准确",
      });
      setTranslated(res.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "翻译失败，请重试");
    } finally {
      setTranslating(false);
    }
  }, []);

  // 划词变化 → 自动切到翻译 Tab 并防抖自动翻译（800ms）
  useEffect(() => {
    const text = selectedText.trim();
    if (!text) return;
    setTab("translate");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doTranslate(text), 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [selectedText, doTranslate]);

  const trimmed = selectedText.trim();

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Tab 头 */}
      <div className="flex gap-1 border-b border-gray-200 px-4 pt-3">
        <TabButton
          active={tab === "intelligence"}
          onClick={() => setTab("intelligence")}
        >
          📋 Intelligence
        </TabButton>
        <TabButton
          active={tab === "translate"}
          onClick={() => setTab("translate")}
        >
          🌐 划词翻译
        </TabButton>
      </div>

      <div className="space-y-4 p-6">
        {tab === "intelligence" ? (
          <IntelligenceView card={card} />
        ) : (
          <TranslateView
            text={trimmed}
            translated={translated}
            translating={translating}
            error={error}
            onTranslate={() => doTranslate(trimmed)}
          />
        )}
      </div>
    </div>
  );
}

/** Tab1：论文智能卡片（标题、作者、关键词、摘要、研究流程）。 */
function IntelligenceView({ card }: { card?: PaperIntelligenceCard }) {
  if (!card) {
    return (
      <p className="text-sm text-gray-400">
        暂无论文摘要数据，可先上传并分析论文。
      </p>
    );
  }

  return (
    <>
      {(card.title || card.authors) && (
        <div className="border-b border-gray-100 pb-4">
          {card.title && (
            <p className="text-lg font-semibold text-gray-900">
              {card.title}
            </p>
          )}
          {card.authors && (
            <p className="mt-1 text-sm text-gray-600">{card.authors}</p>
          )}
        </div>
      )}

      {card.keywords && card.keywords.length > 0 && (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Keywords
          </dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {card.keywords.map((k) => (
              <span
                key={k}
                className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
              >
                {k}
              </span>
            ))}
          </dd>
        </div>
      )}

      <div className="space-y-3">
        <CardField label="Abstract" value={card.abstract} />
        <CardField label="Research Workflow" value={card.workflow} />
      </div>
    </>
  );
}

/** Tab2：划词翻译面板（复用 writing_agent translate）。 */
function TranslateView({
  text,
  translated,
  translating,
  error,
  onTranslate,
}: {
  text: string;
  translated: string;
  translating: boolean;
  error: string;
  onTranslate: () => void;
}) {
  if (!text) {
    return (
      <p className="text-sm text-gray-400">
        在左侧 PDF 中划选一段文本，即可自动翻译为简体中文。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* 原文 */}
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          原文
        </dt>
        <dd className="mt-2 rounded-md bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
          {text}
        </dd>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={onTranslate}
          disabled={translating}
        >
          重新翻译
        </Button>
        {translating && (
          <span className="flex items-center gap-2 text-sm text-gray-500">
            <Spinner /> 翻译中...
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 译文 */}
      {translated && (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            译文（简体中文）
          </dt>
          <dd className="mt-2 rounded-md bg-blue-50 p-3 text-sm leading-relaxed text-gray-800">
            {translated}
          </dd>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-t-md px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? "border-b-2 border-blue-600 text-blue-600"
          : "text-gray-500 hover:text-gray-700")
      }
    >
      {children}
    </button>
  );
}
