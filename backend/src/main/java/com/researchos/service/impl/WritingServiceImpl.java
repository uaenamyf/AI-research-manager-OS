package com.researchos.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.dto.UserSettings;
import com.researchos.dto.WritingRewriteRequest;
import com.researchos.service.SettingsService;
import com.researchos.service.WritingService;
import com.researchos.service.support.LlmOverrideBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Writing Agent 服务实现：转发 ai-service /writing/rewrite。
 *
 * <p>ai-service 不可达或返回错误时，透出友好错误信息。</p>
 * <p>用户如有自定义 LLM 配置，会透传给 ai-service（请求级覆盖）。</p>
 *
 * @author myf
 * @since 2026-07-26
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WritingServiceImpl implements WritingService {

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    // 2026-08-12 myf: 注入 SettingsService 以获取用户自定义 LLM 配置
    private final SettingsService settingsService;
    // 2026-08-12 myf: LLM 覆盖配置构建器（Writing / Chat 共用）
    private final LlmOverrideBuilder llmOverrideBuilder;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    /**
     * 同步改写文本。
     */
    @Override
    public String rewrite(Long userId, WritingRewriteRequest req) {
        try {
            String aiUrl = appProperties.getAiService().getBaseUrl() + "/writing/rewrite";

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("text", req.getText());
            payload.put("action", req.getAction());
            payload.put("instruction", req.getInstruction() == null ? "" : req.getInstruction());

            // 2026-08-12 myf: 透传用户自定义 LLM 配置到 ai-service（请求级覆盖）
            Map<String, Object> llmOverride = llmOverrideBuilder.build(userId);
            if (llmOverride != null) {
                payload.put("llmOverride", llmOverride);
            }

            String body = objectMapper.writeValueAsString(payload);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(aiUrl))
                    .timeout(Duration.ofSeconds(120))
                    .header("Content-Type", "application/json")
                    .header("X-Internal-Token",
                            appProperties.getAiService().getInternalToken())
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.error("ai-service 改写失败: status={}, body={}",
                        response.statusCode(), truncate(response.body(), 200));
                throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
            }

            Map<?, ?> result = objectMapper.readValue(response.body(), Map.class);
            Object text = result.get("text");
            return text == null ? "" : text.toString();

        } catch (BusinessException e) {
            throw e;
        } catch (java.net.http.HttpTimeoutException e) {
            log.error("ai-service 改写超时", e);
            throw new BusinessException(ErrorCode.AI_SERVICE_TIMEOUT);
        } catch (Exception e) {
            log.error("调用 ai-service 改写异常", e);
            throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
        }
    }

    /**
     * 从用户设置中构建 LLM 覆盖配置（仅当用户有自定义配置时返回非 null）。
     */
    /** Google 免费翻译端点（无需密钥，仅代理使用，不向前端暴露）。 */
    private static final String GOOGLE_TRANSLATE_URL =
            "https://translate.googleapis.com/translate_a/single";

    /** DeepL 免费 API 端点（用户自定义 machineProvider=deepl 时使用）。 */
    private static final String DEEPL_API_URL =
            "https://api-free.deepl.com/v2/translate";

    // 2026-08-12 myf: 新增机器翻译代理（翻译器翻译路径）
    @Override
    public TranslateResult translateMachine(Long userId, String text, String targetLang) {
        String target = (targetLang == null || targetLang.isBlank()) ? "zh-CN" : targetLang.trim();

        // 2026-08-12 myf: 优先使用用户自定义的机器翻译提供商（Settings -> 翻译设置）
        UserSettings.Translation t = null;
        try {
            UserSettings s = settingsService.getSettings(userId);
            if (s != null) t = s.getTranslation();
        } catch (Exception e) {
            log.warn("读取用户翻译配置失败，回退系统默认: userId={}", userId, e);
        }
        String provider = (t != null && t.getMachineProvider() != null
                && !t.getMachineProvider().isBlank()) ? t.getMachineProvider() : "google";
        String apiKey = t != null ? t.getMachineApiKey() : null;

        if ("deepl".equalsIgnoreCase(provider) && apiKey != null && !apiKey.isBlank()) {
            return translateDeepL(text, target, apiKey);
        }
        if (!"google".equalsIgnoreCase(provider)) {
            // 其他提供商（baidu/youdao 等）需要额外签名逻辑，暂回退 Google 免费端点
            log.info("机器翻译提供商 {} 未接入，回退 Google 免费端点（userId={}）", provider, userId);
        }
        return translateGoogle(text, target);
    }

    /**
     * Google 免费端点翻译（无密钥）。
     */
    private TranslateResult translateGoogle(String text, String targetLang) {
        // 单次请求限制约 5000 字符，超出按 5000 截断（Google 免费端点硬限制）
        String clipped = text.length() > 5000 ? text.substring(0, 5000) : text;
        String query = java.net.URLEncoder.encode(clipped, java.nio.charset.StandardCharsets.UTF_8);

        try {
            URI uri = URI.create(GOOGLE_TRANSLATE_URL
                    + "?client=gtx&sl=auto&tl=" + java.net.URLEncoder.encode(targetLang,
                            java.nio.charset.StandardCharsets.UTF_8)
                    + "&dt=t&q=" + query);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(uri)
                    .timeout(Duration.ofSeconds(30))
                    .header("User-Agent", "Mozilla/5.0 ResearchOS")
                    .GET()
                    .build();

            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.error("机器翻译失败: status={}, body={}",
                        response.statusCode(), truncate(response.body(), 200));
                throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
            }

            return parseGoogleTranslate(response.body(), targetLang);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("调用机器翻译异常", e);
            throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
        }
    }

    /**
     * DeepL 翻译（用户自定义 provider=deepl + machineApiKey 时使用）。
     *
     * <p>DeepL 免费 API：POST api-free.deepl.com/v2/translate，
     * 鉴权头 Authorization: DeepL-Auth-Key &lt;key&gt;，body 为 form 编码。</p>
     */
    private TranslateResult translateDeepL(String text, String targetLang, String apiKey) {
        // 单次请求限制约 5000 字符（DeepL 单次 5 万字符，此处沿用 5000 截断保持行为一致）
        String clipped = text.length() > 5000 ? text.substring(0, 5000) : text;
        try {
            String body = "text=" + java.net.URLEncoder.encode(clipped,
                    java.nio.charset.StandardCharsets.UTF_8)
                    + "&source_lang=auto&target_lang=" + toDeepLLang(targetLang);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(DEEPL_API_URL))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Authorization", "DeepL-Auth-Key " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.error("DeepL 翻译失败: status={}, body={}",
                        response.statusCode(), truncate(response.body(), 200));
                throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
            }

            Map<?, ?> root = objectMapper.readValue(response.body(), Map.class);
            Object translations = root.get("translations");
            if (!(translations instanceof java.util.List<?> list) || list.isEmpty()
                    || !(list.get(0) instanceof Map<?, ?> first)) {
                log.error("DeepL 响应格式异常: {}", truncate(response.body(), 200));
                throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
            }
            String translated = String.valueOf(first.get("text"));
            Object detected = first.get("detected_source_language");
            String sourceLang = detected == null ? "" : detected.toString();
            return new TranslateResult(translated, sourceLang, targetLang);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("调用 DeepL 翻译异常", e);
            throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
        }
    }

    /**
     * Google 语言码 -> DeepL 语言码（未知语言回退 ZH）。
     */
    private String toDeepLLang(String googleLang) {
        return switch (googleLang == null ? "" : googleLang.trim().toLowerCase()) {
            case "en" -> "EN";
            case "ja" -> "JA";
            case "ko" -> "KO";
            case "fr" -> "FR";
            case "de" -> "DE";
            case "es" -> "ES";
            case "ru" -> "RU";
            case "pt" -> "PT";
            default -> "ZH"; // zh-CN / zh-TW / 未知一律中文
        };
    }

    /**
     * 解析 Google translate_a/single 响应。
     * 结构：[ [ [译文段, 原文段, ...], ... ], 源语言码, ... ]。
     */
    private TranslateResult parseGoogleTranslate(String body, String targetLang)
            throws java.io.IOException {
        Object root = objectMapper.readValue(body, Object.class);
        if (!(root instanceof java.util.List<?> top) || top.isEmpty()
                || !(top.get(0) instanceof java.util.List<?> segments)) {
            throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
        }

        StringBuilder translated = new StringBuilder();
        for (Object seg : segments) {
            if (seg instanceof java.util.List<?> parts && !parts.isEmpty()
                    && parts.get(0) != null) {
                translated.append(parts.get(0).toString());
            }
        }

        String sourceLang = "";
        if (top.size() > 1 && top.get(1) != null) {
            sourceLang = top.get(1).toString();
        }
        return new TranslateResult(translated.toString(), sourceLang, targetLang);
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "...";
    }
}
