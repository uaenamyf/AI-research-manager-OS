/** 顶栏：侧边栏开关 + 用户信息。 */
"use client";

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
          <span className="text-sm text-gray-400">Not signed in</span>
        )}
      </div>
    </header>
  );
}
