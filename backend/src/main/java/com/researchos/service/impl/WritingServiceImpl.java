package com.researchos.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.dto.WritingRewriteRequest;
import com.researchos.dto.WritingTransformRequest;
import com.researchos.dto.WritingTransformResult;
import com.researchos.service.WritingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Writing Agent 服务实现：转发 ai-service /writing/transform 与 /writing/rewrite。
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
     * 文本变换：POST ai-service /writing/transform。
     */
    @Override
    public WritingTransformResult transform(WritingTransformRequest req) {
        try {
            String aiUrl = appProperties.getAiService().getBaseUrl() + "/writing/transform";
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("text", req.getText());
            payload.put("action", req.getAction());

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(aiUrl))
                    .header("Content-Type", "application/json")
                    .header("X-Internal-Token", appProperties.getAiService().getInternalToken())
                    .POST(HttpRequest.BodyPublishers.ofString(
                            objectMapper.writeValueAsString(payload)))
                    .build();

            HttpResponse<String> resp = httpClient.send(
                    request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200) {
                log.warn("ai-service /writing/transform 返回 {}", resp.statusCode());
                throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
            }

            JsonNode root = objectMapper.readTree(resp.body());
            return new WritingTransformResult(root.path("result").asText(""));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("ai-service /writing/transform 调用失败：{}", e.getMessage());
            throw new BusinessException(ErrorCode.AI_SERVICE_ERROR);
        }
    }

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
}
