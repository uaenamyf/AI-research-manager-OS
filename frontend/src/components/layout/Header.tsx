/** 顶栏：侧边栏开关 + 用户信息。 */
"use client";

import Link from "next/link";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";

export function Header() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <button
        onClick={toggleSidebar}
        className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm text-gray-600">{user.email}</span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              {user.plan}
            </span>
          </>
        ) : (
          // date: 2026-08-07
          // dev: myf
          // changelog: 未登录时显示可点击的 Sign in 按钮，直达登录页
          <Link
            href="/login"
            className="rounded-md bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
