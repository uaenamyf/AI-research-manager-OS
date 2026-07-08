/** 设置页：账户信息 + 订阅档位。 */
"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/api/auth";
import { useAuthStore } from "@/stores/auth";
import { Card, Badge } from "@/components/ui";
import type { Plan, User } from "@/types";

const PLAN_META: Record<Plan, { label: string; desc: string }> = {
  FREE: { label: "Free", desc: "10 papers / month" },
  PRO: { label: "Pro", desc: "500 papers · Unlimited AI chat · Review generation" },
  RESEARCHER: { label: "Researcher", desc: "Unlimited · Advanced writing" },
};

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(!user);

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

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!user) return <p>Please sign in.</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">Account</h2>
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

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-gray-900">Subscription</h2>
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
    </div>
  );
}
