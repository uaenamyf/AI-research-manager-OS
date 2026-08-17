/** 设置页：账户信息 + 订阅档位 + LLM / 翻译配置。 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, markManualLogout } from "@/lib/api/auth";
import {
  getUserSettings,
  patchUserSettings,
} from "@/lib/api/settings";
import { createCheckout } from "@/lib/api/subscription";
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
};

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const storeLogout = useAuthStore((s) => s.logout);
  const [loading, setLoading] = useState(!user);
  const [settings, setSettings] = useState<UserSettingsType>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 从 Stripe Checkout 跳回时的状态提示（?upgrade=success | cancelled）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("upgrade");
    if (q === "success") {
      setUpgradeMsg({ type: "ok", text: "Upgrade successful! Your plan has been updated." });
      window.history.replaceState({}, "", "/settings");
    } else if (q === "cancelled") {
      setUpgradeMsg({ type: "err", text: "Upgrade cancelled. You can try again anytime." });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const handleUpgrade = async (plan: Plan) => {
    setUpgradingPlan(plan);
    setUpgradeMsg(null);
    try {
      const { checkoutUrl } = await createCheckout(plan);
      window.location.assign(checkoutUrl);
    } catch (e: any) {
      setUpgradeMsg({ type: "err", text: e.message || "Checkout failed" });
      setUpgradingPlan(null);
    }
  };

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
      setSaveMsg({ type: "ok", text: "Settings saved" });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e: any) {
      setSaveMsg({ type: "err", text: e.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // 后端不可达也照常清本地状态退出
    } finally {
      markManualLogout();
      storeLogout();
      router.push("/login");
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
          {saving ? "Saving…" : "Save Settings"}
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
        <div className="mt-4 border-t border-gray-100 pt-4">
          <Button
            variant="outline"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </Card>

      {/* ===== Subscription ===== */}
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-gray-900">Subscription</h2>
        {upgradeMsg && (
          <div
            className={`mb-4 rounded-md px-4 py-2 text-sm ${
              upgradeMsg.type === "ok"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {upgradeMsg.text}
          </div>
        )}
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
              {user.plan === plan ? (
                <Badge className="bg-green-100 text-green-700">Current</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={upgradingPlan !== null}
                  onClick={() => handleUpgrade(plan)}
                >
                  {upgradingPlan === plan ? (
                    <>
                      <Spinner className="mr-1" /> Redirecting…
                    </>
                  ) : (
                    "Upgrade"
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* ===== LLM Settings ===== */}
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">🧠 LLM Settings</h2>
            <p className="mt-1 text-xs text-gray-500">
              Configure your own LLM API key and model. Leave blank to use the system default.
            </p>
          </div>
        </div>

        {settingsLoading ? (
          <div className="py-8 text-center text-gray-400">
            <Spinner /> <span className="ml-2">Loading…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Provider
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
                  <option value="">System default</option>
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Default model
                </label>
                <Input
                  placeholder="e.g. gpt-4o / claude-sonnet-4"
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
                Stored encrypted and used only for your AI requests
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Base URL (compatible endpoint, optional)
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
                Fill in when using compatible endpoints such as Volcano Engine, OneAPI, or Azure
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Temperature: {settings.llm.temperature ?? 0.7}
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
                <span>Precise (0)</span>
                <span>Creative (2)</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ===== Translation Settings ===== */}
      <Card className="p-5">
        <h2 className="mb-1 font-semibold text-gray-900">🌐 Translation Settings</h2>
        <p className="mb-4 text-xs text-gray-500">
          Configure the default behavior and service for selection translation.
        </p>

        {settingsLoading ? (
          <div className="py-8 text-center text-gray-400">
            <Spinner /> <span className="ml-2">Loading…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Default translation mode
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
                  <option value="machine">⚡ Translator (Fast)</option>
                  <option value="llm">🧠 LLM (Accurate)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Default target language
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
                  Machine translation provider
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
                  Translation API Key (optional)
                </label>
                <Input
                  type="password"
                  placeholder="Baidu: appid:secret; DeepL: Auth Key"
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
    </div>
  );
}
