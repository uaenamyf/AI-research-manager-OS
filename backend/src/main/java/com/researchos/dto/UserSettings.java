package com.researchos.dto;

import lombok.Data;

/**
 * 用户设置 DTO：LLM / 翻译 / Knowledge 等可配置项。
 *
 * <p>与 app_user.settings JSONB 字段对齐，所有字段均为可选（null 表示使用系统默认）。</p>
 *
 * @author myf
 * @since 2026-08-12
 */
@Data
public class UserSettings {

    // ===== LLM 配置 =====
    private Llm llm = new Llm();

    // ===== 翻译配置 =====
    private Translation translation = new Translation();

    // ===== Knowledge / RAG 配置 =====
    private Knowledge knowledge = new Knowledge();

    @Data
    public static class Llm {
        /** 提供商：openai / anthropic / deepseek / doubao 等 */
        private String provider;
        /** API Key（加密存储） */
        private String apiKey;
        /** Base URL（兼容端点，如火山引擎、OneAPI 等） */
        private String baseUrl;
        /** 默认模型名 */
        private String defaultModel;
        /** 温度参数，0-2 */
        private Double temperature;
    }

    @Data
    public static class Translation {
        /** 默认翻译模式：machine / llm */
        private String defaultMode;
        /** 默认目标语言 */
        private String defaultTargetLang;
        /** 机器翻译提供商：google / deepl / baidu / youdao */
        private String machineProvider;
        /** 机器翻译 API Key（如 DeepL / 百度 / 有道） */
        private String machineApiKey;
    }

    @Data
    public static class Knowledge {
        /** 向量检索 top_k */
        private Integer retrieveTopK;
        /** 相似度阈值，0-1 */
        private Double similarityThreshold;
    }
}
