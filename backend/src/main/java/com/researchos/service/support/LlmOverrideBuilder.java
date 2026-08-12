package com.researchos.service.support;

import com.researchos.dto.UserSettings;
import com.researchos.service.SettingsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * LLM 覆盖配置构建器：从用户设置中提取自定义 LLM 配置。
 *
 * <p>Writing / Chat 等调用 ai-service 的服务共用此组件，
 * 保证「用户自定义 API Key / Base URL / 模型」透传行为一致。</p>
 *
 * @author myf
 * @since 2026-08-12
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LlmOverrideBuilder {

    private final SettingsService settingsService;

    /**
     * 从用户设置中构建 LLM 覆盖配置（仅当用户有自定义配置时返回非 null）。
     */
    public Map<String, Object> build(Long userId) {
        try {
            UserSettings settings = settingsService.getSettings(userId);
            if (settings == null) return null;
            UserSettings.Llm llm = settings.getLlm();
            if (llm == null) return null;

            boolean hasCustom = (llm.getProvider() != null && !llm.getProvider().isBlank())
                    || (llm.getApiKey() != null && !llm.getApiKey().isBlank())
                    || (llm.getBaseUrl() != null && !llm.getBaseUrl().isBlank())
                    || (llm.getDefaultModel() != null && !llm.getDefaultModel().isBlank())
                    || llm.getTemperature() != null;

            if (!hasCustom) return null;

            Map<String, Object> map = new LinkedHashMap<>();
            if (llm.getProvider() != null) map.put("provider", llm.getProvider());
            if (llm.getApiKey() != null) map.put("apiKey", llm.getApiKey());
            if (llm.getBaseUrl() != null) map.put("baseUrl", llm.getBaseUrl());
            if (llm.getDefaultModel() != null) map.put("defaultModel", llm.getDefaultModel());
            if (llm.getTemperature() != null) map.put("temperature", llm.getTemperature());
            return map;
        } catch (Exception e) {
            log.warn("获取用户 LLM 配置失败，使用系统默认: userId={}", userId, e);
            return null;
        }
    }

    /**
     * 从用户设置中构建 Knowledge/RAG 检索参数。
     *
     * @return 含 retrieveTopK / similarityThreshold 的 map（未配置则不含对应键）
     */
    public Map<String, Object> buildKnowledgeParams(Long userId) {
        Map<String, Object> map = new LinkedHashMap<>();
        try {
            UserSettings settings = settingsService.getSettings(userId);
            if (settings == null) return map;
            UserSettings.Knowledge knowledge = settings.getKnowledge();
            if (knowledge == null) return map;
            if (knowledge.getRetrieveTopK() != null) {
                map.put("retrieveTopK", knowledge.getRetrieveTopK());
            }
            if (knowledge.getSimilarityThreshold() != null) {
                map.put("similarityThreshold", knowledge.getSimilarityThreshold());
            }
        } catch (Exception e) {
            log.warn("获取用户 Knowledge 配置失败，使用系统默认: userId={}", userId, e);
        }
        return map;
    }
}
