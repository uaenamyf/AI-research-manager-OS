package com.researchos.service;

import com.researchos.dto.UserSettings;

/**
 * 用户设置服务接口。
 *
 * @author myf
 * @since 2026-08-12
 */
public interface SettingsService {

    /** 获取当前用户设置（如为空返回默认对象）。 */
    UserSettings getSettings(Long userId);

    /** 全量更新用户设置。 */
    UserSettings updateSettings(Long userId, UserSettings settings);

    /** 部分更新：仅更新传入的非空字段。 */
    UserSettings patchSettings(Long userId, UserSettings settings);
}
