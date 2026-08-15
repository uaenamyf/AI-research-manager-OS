package com.researchos.service.support;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Crossref 元数据客户端：按 DOI 解析权威文献元数据。
 *
 * <p>用于「文献一键导入」时补全 title/authors/year/venue；
 * 网络不可用或 DOI 不存在时优雅降级（返回 empty，调用方用请求参数兜底）。</p>
 *
 * @author myf
 * @since 2026-08-15
 */
@Slf4j
@Component
public class CrossrefService {

    /** Crossref 解析结果。 */
    public record CrossrefMeta(String title, String authors, Integer year, String venue) {
    }

    private final RestClient client;

    public CrossrefService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(8000);
        factory.setReadTimeout(8000);

        this.client = RestClient.builder()
                .baseUrl("https://api.crossref.org")
                .requestFactory(factory)
                .defaultHeader("User-Agent", "ResearchOS-AI/0.1 (mailto:dev@researchos.local)")
                .build();
    }

    /**
     * 按 DOI 解析元数据。失败（网络/404/解析）返回 empty，不向上抛。
     */
    public Optional<CrossrefMeta> resolve(String doi) {
        try {
            JsonNode body = client.get()
                    .uri("/works/{doi}", doi)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new NotFoundException("Crossref DOI not found: " + doi);
                    })
                    .body(JsonNode.class);

            JsonNode msg = body == null ? null : body.path("message");
            if (msg == null || msg.isMissingNode()) {
                return Optional.empty();
            }

            String title = msg.path("title").isArray() && !msg.path("title").isEmpty()
                    ? msg.path("title").get(0).asText("") : "";
            String venue = msg.path("container-title").isArray() && !msg.path("container-title").isEmpty()
                    ? msg.path("container-title").get(0).asText("") : "";
            Integer year = extractYear(msg);
            String authors = extractAuthors(msg);

            return Optional.of(new CrossrefMeta(title, authors, year, venue));
        } catch (NotFoundException e) {
            log.info("Crossref 未收录该 DOI：{}", doi);
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Crossref 元数据解析失败（doi={}）：{}", doi, e.getMessage());
            return Optional.empty();
        }
    }

    private Integer extractYear(JsonNode msg) {
        JsonNode issued = msg.path("issued").path("date-parts");
        if (issued.isArray() && !issued.isEmpty() && issued.get(0).isArray() && !issued.get(0).isEmpty()) {
            try {
                return issued.get(0).get(0).asInt();
            } catch (Exception ignored) {
                // fall through
            }
        }
        JsonNode published = msg.path("published-print").path("date-parts");
        if (published.isArray() && !published.isEmpty() && published.get(0).isArray() && !published.get(0).isEmpty()) {
            try {
                return published.get(0).get(0).asInt();
            } catch (Exception ignored) {
                // fall through
            }
        }
        return null;
    }

    private String extractAuthors(JsonNode msg) {
        JsonNode authors = msg.path("author");
        if (!authors.isArray()) {
            return "";
        }
        List<String> names = new ArrayList<>();
        for (JsonNode a : authors) {
            String given = a.path("given").asText("");
            String family = a.path("family").asText("");
            if (family.isBlank()) {
                continue;
            }
            names.add(given.isBlank() ? family : given + " " + family);
        }
        return String.join(", ", names);
    }

    /** 内部异常：DOI 不存在。 */
    private static class NotFoundException extends RuntimeException {
        NotFoundException(String message) {
            super(message);
        }
    }
}
