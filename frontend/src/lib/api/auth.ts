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

/** Google OAuth 重定向地址 */
export function getGoogleOAuthUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  return `${base}/api/auth/oauth/google`;
}