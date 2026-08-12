/** 用户设置 API（Settings 页面）。 */
import { apiFetch } from "./client";
import type { UserSettings } from "@/types";

/** 获取当前用户设置 */
export function getUserSettings(): Promise<UserSettings> {
  return apiFetch<UserSettings>("/api/settings");
}

/** 全量更新用户设置 */
export function updateUserSettings(settings: UserSettings): Promise<UserSettings> {
  return apiFetch<UserSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

/** 部分更新用户设置（仅更新传入的字段） */
export function patchUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  return apiFetch<UserSettings>("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}
