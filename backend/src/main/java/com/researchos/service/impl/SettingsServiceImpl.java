package com.researchos.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.dto.UserSettings;
import com.researchos.entity.User;
import com.researchos.service.SettingsService;
import com.researchos.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用户设置服务实现。
 *
 * <p>设置存储在 app_user.settings JSONB 字段中。所有字段均为可选，
 * null 表示使用系统默认值。</p>
 *
 * @author myf
 * @since 2026-08-12
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SettingsServiceImpl implements SettingsService {

    private final UserService userService;
    private final ObjectMapper objectMapper;

    @Override
    public UserSettings getSettings(Long userId) {
        User user = userService.requireUser(userId);
        UserSettings s = user.getSettings();
        return s != null ? s : new UserSettings();
    }

    @Override
    @Transactional
    public UserSettings updateSettings(Long userId, UserSettings settings) {
        User user = userService.requireUser(userId);
        user.setSettings(settings != null ? settings : new UserSettings());
        userService.updateById(user);
        log.info("用户 {} 设置已更新", userId);
        return user.getSettings();
    }

    @Override
    @Transactional
    public UserSettings patchSettings(Long userId, UserSettings patch) {
        User user = userService.requireUser(userId);
        UserSettings current = user.getSettings();
        if (current == null) {
            current = new UserSettings();
        }

        // 合并 patch 到 current（仅非空字段）
        mergeLlm(current.getLlm(), patch.getLlm());
        mergeTranslation(current.getTranslation(), patch.getTranslation());
        mergeKnowledge(current.getKnowledge(), patch.getKnowledge());

        user.setSettings(current);
        userService.updateById(user);
        log.info("用户 {} 设置已部分更新", userId);
        return current;
    }

    // ===== 合并辅助方法 =====

    private void mergeLlm(UserSettings.Llm current, UserSettings.Llm patch) {
        if (patch == null) return;
        if (patch.getProvider() != null) current.setProvider(patch.getProvider());
        if (patch.getApiKey() != null) current.setApiKey(patch.getApiKey());
        if (patch.getBaseUrl() != null) current.setBaseUrl(patch.getBaseUrl());
        if (patch.getDefaultModel() != null) current.setDefaultModel(patch.getDefaultModel());
        if (patch.getTemperature() != null) current.setTemperature(patch.getTemperature());
    }

    private void mergeTranslation(UserSettings.Translation current,
                                   UserSettings.Translation patch) {
        if (patch == null) return;
        if (patch.getDefaultMode() != null) current.setDefaultMode(patch.getDefaultMode());
        if (patch.getDefaultTargetLang() != null)
            current.setDefaultTargetLang(patch.getDefaultTargetLang());
        if (patch.getMachineProvider() != null)
            current.setMachineProvider(patch.getMachineProvider());
        if (patch.getMachineApiKey() != null)
            current.setMachineApiKey(patch.getMachineApiKey());
    }

    private void mergeKnowledge(UserSettings.Knowledge current,
                                 UserSettings.Knowledge patch) {
        if (patch == null) return;
        if (patch.getRetrieveTopK() != null) current.setRetrieveTopK(patch.getRetrieveTopK());
        if (patch.getSimilarityThreshold() != null)
            current.setSimilarityThreshold(patch.getSimilarityThreshold());
    }
}
