/** 应用外壳：侧边栏 + 主内容区。 */
"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { getCurrentUser } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // 挂载时若未登录（如 OAuth 重定向回来），尝试拉取当前用户
  useEffect(() => {
    if (!user) {
      getCurrentUser()
        .then(setUser)
        .catch(() => {
          /* 未登录，保持 null */
        });
    }
  }, [user, setUser]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {sidebarOpen && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
