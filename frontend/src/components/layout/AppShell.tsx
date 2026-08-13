/** 应用外壳：侧边栏 + 主内容区。 */
"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import {
  demoLogin,
  getCurrentUser,
  isDevAutoLoginEnabled,
  isManualLogout,
} from "@/lib/api/auth";
import { cn } from "@/lib/utils";

/**
 * 恢复登录态：先拉当前用户；失败且在 dev 模式则静默登录 demo 账号。
 * 带指数重试，覆盖 backend 启动窗口期（最多 4 次，间隔 1s/2s/4s/8s）。
 */
async function restoreAuth(
  setUser: (user: import("@/types").User | null) => void,
  attempt = 0,
): Promise<void> {
  const MAX_ATTEMPTS = 4;
  // 手动退出后保持退出状态，不再自动登录（含 dev 模式的 demo 静默登录）
  if (isManualLogout()) return;
  try {
    const user = await getCurrentUser();
    setUser(user);
  } catch {
    if (attempt < MAX_ATTEMPTS) {
      if (isDevAutoLoginEnabled()) {
        try {
          const user = await demoLogin();
          setUser(user);
          return;
        } catch {
          /* backend 未就绪，等待重试 */
        }
      }
      setTimeout(
        () => restoreAuth(setUser, attempt + 1),
        1000 * 2 ** attempt,
      );
    }
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // 挂载时若未登录（如 reload / OAuth 重定向回来），恢复登录态
  useEffect(() => {
    if (!user) {
      restoreAuth(setUser);
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
