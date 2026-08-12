/** Paper Intelligence Card 展示组件：Tab1 标题/作者/关键词/摘要/研究流程；Tab2 划词翻译。 */
"use client";

import { useEffect, useRef, useState } from "react";
import { getUserSettings } from "@/lib/api/settings";
import { rewriteText, translateMachine } from "@/lib/api/writing";
import { TRANSLATE_LANGS, type PaperIntelligenceCard } from "@/types";
import { CardField } from "./CardField";

type TabKey = "card" | "translate";
type TranslateMode = "machine" | "llm";

const TAB_STYLE =
  "px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px";
const TAB_ACTIVE = "border-blue-600 text-blue-700";
const TAB_INACTIVE =
  "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300";

/** 从全局选区取非空文本（用于划词自动填充），超长截断。 */
function getSelectedText(): string {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : "";
  return text.length > 5000 ? text.slice(0, 5000) : text;
}

export function PaperCard({ card }: { card: PaperIntelligenceCard }) {
  const [tab, setTab] = useState<TabKey>("card");

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Tab 头 */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 pt-2">
        <h2 className="sr-only">Paper Intelligence Card</h2>
        <div className="flex gap-1">
          <button
            type="button"
            className={`${TAB_STYLE} ${tab === "card" ? TAB_ACTIVE : TAB_INACTIVE}`}
            onClick={() => setTab("card")}
          >
            Paper Intelligence
          </button>
          <button
            type="button"
            className={`${TAB_STYLE} ${tab === "translate" ? TAB_ACTIVE : TAB_INACTIVE}`}
            onClick={() => setTab("translate")}
          >
            划词翻译
          </button>
        </div>
      </div>

      {tab === "card" ? (
        <CardContent card={card} />
      ) : (
        <TranslatePanel />
      )}
    </div>
  );
}

/** Tab1：论文智能卡片内容。 */
function CardContent({ card }: { card: PaperIntelligenceCard }) {
  return (
    <div className="space-y-4 p-6">
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
    </div>
  );
}

/** Tab2：划词翻译面板（翻译器 / 大模型 可选）。 */
function TranslatePanel() {
  // 2026-08-12 myf: 初始值读取用户设置（Settings -> 翻译设置），未配置用系统默认
  const [mode, setMode] = useState<TranslateMode>("machine");
  const [targetLang, setTargetLang] = useState("zh-CN");
  const [sourceText, setSourceText] = useState("");
  const [result, setResult] = useState("");
  const [sourceLang, setSourceLang] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 挂载时加载用户翻译设置：默认模式 / 默认目标语言
  useEffect(() => {
    let cancelled = false;
    getUserSettings()
      .then((s) => {
        if (cancelled) return;
        const t = s?.translation;
        if (t?.defaultMode === "llm" || t?.defaultMode === "machine") {
          setMode(t.defaultMode);
        }
        if (
          t?.defaultTargetLang &&
          TRANSLATE_LANGS.some((l) => l.code === t.defaultTargetLang)
        ) {
          setTargetLang(t.defaultTargetLang);
        }
      })
      .catch(() => {
        // 读取失败静默回退系统默认，不影响翻译面板使用
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 划词自动填充：监听全局 mouseup，选区非空时填入原文输入框
  useEffect(() => {
    const onMouseUp = () => {
      const text = getSelectedText();
      if (text) setSourceText(text);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  const targetLabel =
    TRANSLATE_LANGS.find((l) => l.code === targetLang)?.label ?? targetLang;

  const canTranslate = sourceText.trim().length > 0 && !loading;

  const handleTranslate = async () => {
    if (!canTranslate) return;
    setLoading(true);
    setError("");
    setResult("");
    setCopied(false);
    try {
      if (mode === "machine") {
        const res = await translateMachine({
          text: sourceText,
          targetLang,
        });
        setResult(res.text);
        setSourceLang(res.sourceLang ?? "");
      } else {
        const res = await rewriteText({
          text: sourceText,
          action: "translate",
          instruction: `请将文本翻译成${targetLabel}，只输出译文，不要任何解释。`,
        });
        setResult(res.text);
        setSourceLang("");
      }
    } catch (e) {
      setError(
        mode === "machine"
          ? "翻译器暂时不可用，请尝试「大模型翻译」。"
          : "大模型翻译失败，请稍后重试。",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4 p-6">
      <p className="text-xs text-gray-500">
        在 PDF 或上方文本中选中文字会自动填入；也可直接输入或粘贴。
      </p>

      {/* 原文输入 */}
      <div>
        <textarea
          ref={textareaRef}
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="选中论文中的英文段落，或在此输入要翻译的文本…"
          rows={5}
          className="w-full resize-y rounded-md border border-gray-300 p-3 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 翻译方式 + 目标语言 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-gray-300">
          <button
            type="button"
            onClick={() => setMode("machine")}
            className={`px-3 py-1.5 text-sm font-medium ${
              mode === "machine"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
            title="翻译器：快，免费额度"
          >
            ⚡ 翻译器
          </button>
          <button
            type="button"
            onClick={() => setMode("llm")}
            className={`px-3 py-1.5 text-sm font-medium ${
              mode === "llm"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
            title="大模型：更准，适合学术表达"
          >
            🧠 大模型
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          译成
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            {TRANSLATE_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleTranslate}
          disabled={!canTranslate}
          className="ml-auto rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? mode === "machine"
              ? "翻译中…"
              : "大模型生成中…"
            : "翻译"}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 结果 */}
      {result && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              译文
              {sourceLang && (
                <span className="ml-2 normal-case tracking-normal text-gray-400">
                  （检测到源语言：{sourceLang}）
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              {copied ? "✓ 已复制" : "复制"}
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-800">
            {result}
          </p>
        </div>
      )}
    </div>
  );
}

