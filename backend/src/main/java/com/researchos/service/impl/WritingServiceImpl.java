package com.researchos.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.dto.WritingRewriteRequest;
import com.researchos.service.WritingService;
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
                        response.statusCode(), response.body());
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

    /** Google 免费翻译端点（无需密钥，仅代理使用，不向前端暴露）。 */
    private static final String GOOGLE_TRANSLATE_URL =
            "https://translate.googleapis.com/translate_a/single";

    // 2026-08-12 myf: 新增机器翻译代理（翻译器翻译路径）
    @Override
    public TranslateResult translateMachine(Long userId, String text, String targetLang) {
        String target = (targetLang == null || targetLang.isBlank()) ? "zh-CN" : targetLang.trim();
        // 单次请求限制约 5000 字符，超出按 5000 截断（Google 免费端点硬限制）
        String clipped = text.length() > 5000 ? text.substring(0, 5000) : text;
        String query = java.net.URLEncoder.encode(clipped, java.nio.charset.StandardCharsets.UTF_8);

        try {
            URI uri = URI.create(GOOGLE_TRANSLATE_URL
                    + "?client=gtx&sl=auto&tl=" + java.net.URLEncoder.encode(target,
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

            return parseGoogleTranslate(response.body(), target);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("调用机器翻译异常", e);
            throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
        }
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
