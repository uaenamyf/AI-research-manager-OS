/** 认证相关 API（F1）。 */
import { apiFetch } from "./client";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from "@/types";

/** 邮箱注册 */
export function register(data: RegisterRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 邮箱登录 */
export function login(data: LoginRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** 登出 */
export function logout(): Promise<void> {
  return apiFetch<void>("/api/auth/logout", { method: "POST" });
}

/** 获取当前登录用户 */
export function getCurrentUser(): Promise<User> {
  return apiFetch<User>("/api/auth/me");
}

// ===== 开发/测试模式自动登录 =====
// date: 2026-08-07
// dev: myf
// changelog: 测试阶段免手动登录：dev 模式静默登录 demo 账号
const DEMO_EMAIL = "demo@researchos.local";
const DEMO_PASSWORD = "Demo@123456";

/** 仅非生产环境启用自动登录，避免污染线上。 */
export function isDevAutoLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** 静默登录 demo 账号，返回当前用户。 */
export async function demoLogin(): Promise<User> {
  const res = await login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  return res.user;
}

/** Google OAuth 重定向地址 */
export function getGoogleOAuthUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  return `${base}/api/auth/oauth/google`;
}