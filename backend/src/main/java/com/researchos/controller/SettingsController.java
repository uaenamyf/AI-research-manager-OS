package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.dto.UserSettings;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.SettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 用户设置控制器：LLM / 翻译 / Knowledge 等偏好配置。
 *
 * @author myf
 * @since 2026-08-12
 */
@RestController
@RequestMapping("/api/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;
    private final CurrentUserResolver currentUserResolver;

    /** 获取当前用户设置。 */
    @GetMapping
    public ApiResponse<UserSettings> getSettings() {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(settingsService.getSettings(userId));
    }

    /** 全量更新用户设置。 */
    @PutMapping
    public ApiResponse<UserSettings> updateSettings(
            @Valid @RequestBody UserSettings settings) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(settingsService.updateSettings(userId, settings));
    }

    /** 部分更新用户设置（仅更新传入的非空字段）。 */
    @PatchMapping
    public ApiResponse<UserSettings> patchSettings(
            @RequestBody UserSettings settings) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(settingsService.patchSettings(userId, settings));
    }
}
