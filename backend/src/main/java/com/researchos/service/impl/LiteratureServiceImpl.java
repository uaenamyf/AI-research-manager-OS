package com.researchos.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.service.LiteratureService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 文献检索服务实现：转发 ai-service /literature/*（MCP 学术搜索）。
 *
 * <p>backend 不实现搜索逻辑，仅做鉴权转发与错误封装。</p>
 *
 * @author myf
 * @since 2026-08-12
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LiteratureServiceImpl implements LiteratureService {

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Override
    public Map<String, Object> search(String query, Integer limit, List<String> sources,
                                      Integer yearFrom, Integer yearTo, Boolean openAccess) {
        StringBuilder url = new StringBuilder(
                appProperties.getAiService().getBaseUrl() + "/literature/search");
        url.append("?query=").append(URLEncoder.encode(query, StandardCharsets.UTF_8));
        if (limit != null) {
            url.append("&limit=").append(limit);
        }
        if (sources != null && !sources.isEmpty()) {
            url.append("&sources=").append(String.join(",", sources));
        }
        if (yearFrom != null) {
            url.append("&year_from=").append(yearFrom);
        }
        if (yearTo != null) {
            url.append("&year_to=").append(yearTo);
        }
        if (openAccess != null) {
            url.append("&open_access=").append(openAccess);
        }
        return forward("GET", url.toString(), null);
    }

    /** 转发 GET 到 ai-service，解析 JSON 返回。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> forward(String method, String url, String body) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("X-Internal-Token", appProperties.getAiService().getInternalToken())
                    .timeout(Duration.ofSeconds(90));
            if (body != null) {
                builder.header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body));
            } else {
                builder.GET();
            }
            HttpResponse<String> resp = httpClient.send(
                    builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200) {
                log.warn("ai-service /literature 返回 {}: {}", resp.statusCode(), resp.body());
                throw new BusinessException(ErrorCode.AI_SERVICE_ERROR.getCode(),
                        "Academic search service temporarily unavailable. Please try again later");
            }
            return objectMapper.readValue(resp.body(), LinkedHashMap.class);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("调用 ai-service /literature 异常", e);
            throw new BusinessException(ErrorCode.AI_SERVICE_ERROR.getCode(),
                    "Academic search service temporarily unavailable. Please try again later");
        }
    }
}
