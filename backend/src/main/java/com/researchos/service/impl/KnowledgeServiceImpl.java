package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.config.AppProperties;
import com.researchos.dto.KnowledgeSearchResult;
import com.researchos.dto.KnowledgeTagDto;
import com.researchos.entity.Paper;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.KnowledgeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 知识库服务实现：标签查询、语义搜索。
 *
 * <p>搜索链路：按 user_id 取论文范围 -> 调 ai-service /search 做向量语义检索
 * （带 X-Internal-Token）-> 聚合 paper 元数据返回；ai-service 不可达时降级
 * 为 title/authors LIKE 模糊搜索。</p>
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeServiceImpl implements KnowledgeService {

    private final PaperMapper paperMapper;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    /** ai-service 返回的单个命中项。 */
    private record SemanticHit(Long paperId, String snippet, double score) {
    }

    /**
     * 获取标签（MVP 暂用 title 关键词占位聚合）。
     */
    @Override
    public List<KnowledgeTagDto> listTags(Long userId) {
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>()
                        .eq(Paper::getUserId, userId)
                        .isNotNull(Paper::getTitle));
        // MVP：以 title 关键词占位聚合；P1 接入真实标签表后替换
        Map<String, Long> counts = new HashMap<>();
        for (Paper p : papers) {
            if (p.getTitle() == null) {
                continue;
            }
            for (String kw : p.getTitle().toLowerCase().split("[^a-z0-9]+")) {
                if (kw.isEmpty()) {
                    continue;
                }
                counts.merge(kw, 1L, Long::sum);
            }
        }
        return counts.entrySet().stream()
                .map(e -> new KnowledgeTagDto(null, e.getKey(), e.getValue().intValue()))
                .sorted(Comparator.comparingInt(KnowledgeTagDto::getCount).reversed())
                .toList();
    }

    /**
     * 语义搜索：先经 ai-service 向量检索，失败降级为 LIKE 模糊搜索。
     */
    @Override
    public List<KnowledgeSearchResult> search(Long userId, String query, int limit) {
        // 1. 取该用户论文范围（多租户隔离）
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>().eq(Paper::getUserId, userId));
        if (papers.isEmpty()) {
            return Collections.emptyList();
        }

        // 2. 语义搜索（ai-service），失败降级
        try {
            List<SemanticHit> hits = semanticSearch(papers, query, limit);
            return aggregate(papers, hits);
        } catch (Exception e) {
            log.warn("ai-service 语义搜索不可用，降级为 LIKE 搜索：{}", e.getMessage());
            return fallbackSearch(papers, query, limit);
        }
    }

    /**
     * 调用 ai-service /search 做跨论文向量检索。
     */
    private List<SemanticHit> semanticSearch(List<Paper> papers, String query, int limit) throws Exception {
        String aiUrl = appProperties.getAiService().getBaseUrl() + "/search";
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("paperIds", papers.stream().map(Paper::getId).toList());
        payload.put("query", query);
        payload.put("topK", limit);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(aiUrl))
                .header("Content-Type", "application/json")
                .header("X-Internal-Token", appProperties.getAiService().getInternalToken())
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

        HttpResponse<String> resp = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (resp.statusCode() != 200) {
            throw new IllegalStateException("ai-service /search 返回 " + resp.statusCode());
        }

        JsonNode results = objectMapper.readTree(resp.body()).path("results");
        List<SemanticHit> hits = new java.util.ArrayList<>();
        for (JsonNode r : results) {
            hits.add(new SemanticHit(
                    r.path("paperId").asLong(),
                    r.path("content").asText(""),
                    r.path("score").asDouble(0.0)
            ));
        }
        return hits;
    }

    /**
     * 聚合 ai-service 命中项与 paper 元数据。
     */
    private List<KnowledgeSearchResult> aggregate(List<Paper> papers, List<SemanticHit> hits) {
        Map<Long, Paper> byId = new HashMap<>();
        for (Paper p : papers) {
            byId.put(p.getId(), p);
        }
        return hits.stream().map(hit -> {
            Paper p = byId.get(hit.paperId());
            if (p == null) {
                return null;
            }
            return new KnowledgeSearchResult(
                    p.getId(), p.getTitle(), p.getAuthors(),
                    truncate(hit.snippet(), 200),
                    extractTags(p.getSummary()),
                    hit.score()
            );
        }).filter(Objects::nonNull).toList();
    }

    /**
     * 降级搜索：title/authors LIKE 模糊匹配（内存过滤，保持原语义）。
     */
    private List<KnowledgeSearchResult> fallbackSearch(List<Paper> papers, String query, int limit) {
        return papers.stream()
                .filter(p -> containsIgnoreCase(p.getTitle(), query) || containsIgnoreCase(p.getAuthors(), query))
                .limit(limit)
                .map(p -> new KnowledgeSearchResult(
                        p.getId(), p.getTitle(), p.getAuthors(),
                        p.getTitle(), extractTags(p.getSummary()), 1.0
                ))
                .toList();
    }

    private boolean containsIgnoreCase(String text, String keyword) {
        return text != null && text.toLowerCase().contains(keyword.toLowerCase());
    }

    private String truncate(String text, int max) {
        if (text == null || text.length() <= max) {
            return text;
        }
        return text.substring(0, max) + "...";
    }

    /**
     * 从 summary（Paper Intelligence Card JSON）提取 tags 列表。
     */
    private List<String> extractTags(Map<String, Object> summary) {
        if (summary == null || !(summary.get("tags") instanceof String tagsStr) || tagsStr.isBlank()) {
            return Collections.emptyList();
        }
        return List.of(tagsStr.split(","));
    }
}
