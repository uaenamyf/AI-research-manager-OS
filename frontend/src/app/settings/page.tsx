/** 设置页：账户信息 + 订阅档位 + LLM / 翻译 / Knowledge 配置。 */
"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/api/auth";
import {
  getUserSettings,
  patchUserSettings,
} from "@/lib/api/settings";
import { useAuthStore } from "@/stores/auth";
import { Card, Badge, Button, Input, Spinner } from "@/components/ui";
import {
  LLM_PROVIDERS,
  TRANSLATE_PROVIDERS,
  TRANSLATE_LANGS,
  type Plan,
  type User,
  type UserSettings as UserSettingsType,
  type TranslateMode,
} from "@/types";

const PLAN_META: Record<Plan, { label: string; desc: string }> = {
  FREE: { label: "Free", desc: "10 papers / month" },
  PRO: { label: "Pro", desc: "500 papers · Unlimited AI chat · Review generation" },
  RESEARCHER: { label: "Researcher", desc: "Unlimited · Advanced writing" },
};

const DEFAULT_SETTINGS: UserSettingsType = {
  llm: {},
  translation: {},
  knowledge: {},
};

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(!user);
  const [settings, setSettings] = useState<UserSettingsType>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!user) {
      getCurrentUser()
        .then(setUser)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user, setUser]);

  // 加载用户设置
  useEffect(() => {
    if (!user) return;
    getUserSettings()
      .then((s) => setSettings(s || DEFAULT_SETTINGS))
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await patchUserSettings(settings);
      setSettings(updated);
      setSaveMsg({ type: "ok", text: "设置已保存" });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e: any) {
      setSaveMsg({ type: "err", text: e.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!user) return <p>Please sign in.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <Button onClick={handleSave} disabled={saving || settingsLoading}>
          {saving && <Spinner className="mr-2" />}
          {saving ? "保存中…" : "保存设置"}
        </Button>
      </div>

      {saveMsg && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            saveMsg.type === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {saveMsg.text}
        </div>
      )}

      {/* ===== Account ===== */}
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-gray-900">Account</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Email</dt>
            <dd className="text-gray-900">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Plan</dt>
            <dd>
              <Badge className="bg-gray-100 text-gray-700">
                {PLAN_META[user.plan].label}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      {/* ===== Subscription ===== */}
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-gray-900">Subscription</h2>
        <div className="space-y-3">
          {(Object.keys(PLAN_META) as Plan[]).map((plan) => (
            <div
              key={plan}
              className={`flex items-center justify-between rounded-md border p-3 ${
                user.plan === plan
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-200"
              }`}
            >
              <div>
                <p className="font-medium text-gray-900">
                  {PLAN_META[plan].label}
                </p>
                <p className="text-xs text-gray-500">{PLAN_META[plan].desc}</p>
              </div>
              {user.plan === plan && (
                <Badge className="bg-green-100 text-green-700">Current</Badge>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* ===== LLM 设置 ===== */}
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">🧠 大模型设置</h2>
            <p className="mt-1 text-xs text-gray-500">
              配置你自己的 LLM API Key 和模型。留空则使用系统默认配置。
            </p>
          </div>
        </div>

        {settingsLoading ? (
          <div className="py-8 text-center text-gray-400">
            <Spinner /> <span className="ml-2">加载中…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  提供商
                </label>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  value={settings.llm.provider || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      llm: { ...settings.llm, provider: e.target.value || undefined },
                    })
                  }
                >
                  <option value="">系统默认</option>
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  默认模型
                </label>
                <Input
                  placeholder="如 gpt-4o / claude-sonnet-4"
                  value={settings.llm.defaultModel || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      llm: { ...settings.llm, defaultModel: e.target.value || undefined },
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                API Key
              </label>
              <Input
                type="password"
                placeholder="sk-..."
                value={settings.llm.apiKey || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    llm: { ...settings.llm, apiKey: e.target.value || undefined },
                  })
                }
              />
              <p className="mt-1 text-xs text-gray-400">
                密钥加密存储，仅用于你的 AI 请求
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Base URL（兼容端点，可选）
              </label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={settings.llm.baseUrl || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    llm: { ...settings.llm, baseUrl: e.target.value || undefined },
                  })
                }
              />
              <p className="mt-1 text-xs text-gray-400">
                使用火山引擎、OneAPI、Azure 等兼容端点时填写
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                温度 Temperature: {settings.llm.temperature ?? 0.7}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.llm.temperature ?? 0.7}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    llm: {
                      ...settings.llm,
                      temperature: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-gray-900"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>精确（0）</span>
                <span>创意（2）</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ===== 翻译设置 ===== */}
      <Card className="p-5">
        <h2 className="mb-1 font-semibold text-gray-900">🌐 翻译设置</h2>
        <p className="mb-4 text-xs text-gray-500">
          配置划词翻译的默认行为和翻译服务。
        </p>

        {settingsLoading ? (
          <div className="py-8 text-center text-gray-400">
            <Spinner /> <span className="ml-2">加载中…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  默认翻译模式
                </label>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  value={settings.translation.defaultMode || "machine"}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      translation: {
                        ...settings.translation,
                        defaultMode: e.target.value as TranslateMode,
                      },
                    })
                  }
                >
                  <option value="machine">⚡ 翻译器（快）</option>
                  <option value="llm">🧠 大模型（准）</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  默认目标语言
                </label>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  value={settings.translation.defaultTargetLang || "zh-CN"}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      translation: {
                        ...settings.translation,
                        defaultTargetLang: e.target.value,
                      },
                    })
                  }
                >
                  {TRANSLATE_LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  机器翻译提供商
                </label>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  value={settings.translation.machineProvider || "mymemory"}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      translation: {
                        ...settings.translation,
                        machineProvider: e.target.value,
                      },
                    })
                  }
                >
                  {TRANSLATE_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  翻译 API Key（可选）
                </label>
                <Input
                  type="password"
                  placeholder="百度填 appid:密钥；DeepL 填 Auth Key"
                  value={settings.translation.machineApiKey || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      translation: {
                        ...settings.translation,
                        machineApiKey: e.target.value || undefined,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ===== Knowledge 设置 ===== */}
      <Card className="p-5">
        <h2 className="mb-1 font-semibold text-gray-900">📚 Knowledge & RAG 设置</h2>
        <p className="mb-4 text-xs text-gray-500">
          调整知识库检索和 RAG 的行为参数。
        </p>

        {settingsLoading ? (
          <div className="py-8 text-center text-gray-400">
            <Spinner /> <span className="ml-2">加载中…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  检索 Top-K
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.knowledge.retrieveTopK ?? 5}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      knowledge: {
                        ...settings.knowledge,
                        retrieveTopK: parseInt(e.target.value) || undefined,
                      },
                    })
                  }
                />
                <p className="mt-1 text-xs text-gray-400">返回最相关的片段数（1-20）</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  相似度阈值
                </label>
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={settings.knowledge.similarityThreshold ?? 0.5}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      knowledge: {
                        ...settings.knowledge,
                        similarityThreshold: parseFloat(e.target.value) || undefined,
                      },
                    })
                  }
                />
                <p className="mt-1 text-xs text-gray-400">过滤低相似度结果（0-1）</p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
