/** 带拦截器的 baseURL 后端 API 客户端，所有调用的统一入口。 */
import { ApiError, type ApiResponse } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * 统一 API 调用封装。
 * - 自动携带 httpOnly cookie（credentials: include）
 * - 统一解析 { code, message, data } 响应体
 * - code !== 0 视为业务错误
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  // date: 2026-08-07
  // dev: myf
  // changelog: 登录态失效（401）时引导回登录页；排除 auth 接口避免死循环
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Session expired, please sign in again");
  }

  if (!res.ok) {
    // 后端统一响应 { code, message, data }，即使 HTTP 非 2xx 也优先解析 message；
    // 解析失败（如网关错误、纯文本）时退化为响应原文。
    const raw = await res.text();
    try {
      const body: ApiResponse<unknown> = JSON.parse(raw);
      if (typeof body.message === "string" && body.message) {
        throw new ApiError(body.code ?? res.status, body.message);
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
    }
    throw new ApiError(res.status, raw || `Request failed (${res.status})`);
  }

  const body: ApiResponse<T> = await res.json();
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message);
  }
  return body.data;
}

/** 用于文件上传等非 JSON 场景，返回原始 Response */
export async function apiFetchRaw(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res;
}