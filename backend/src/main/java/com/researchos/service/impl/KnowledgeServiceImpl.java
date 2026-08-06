package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.config.AppProperties;
import com.researchos.dto.KnowledgeGraphLink;
import com.researchos.dto.KnowledgeGraphNode;
import com.researchos.dto.KnowledgeGraphResult;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 知识库服务实现：标签查询、语义搜索、知识图谱。
 *
 * <p>搜索链路：按 user_id 取论文范围 -> 调 ai-service /search 做向量语义检索
 * （带 X-Internal-Token）-> 聚合 paper 元数据返回；ai-service 不可达时降级
 * 为 title/authors LIKE 模糊搜索。</p>
 *
 * <p>图谱链路：调 ai-service /graph/similarities 取论文两两向量相似度建边；
 * ai-service 不可达时降级为 title 共享关键词建边。</p>
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

    /** 图谱：相似度低于该阈值的边不建。 */
    private static final double SIMILARITY_THRESHOLD = 0.55;

    /** 图谱：每篇论文最多关联边数。 */
    private static final int MAX_DEGREE = 6;

    /** 图谱：总边数上限。 */
    private static final int MAX_LINKS = 60;

    /** 图谱降级：标题共享词中的停用词（不参与建边）。 */
    private static final Set<String> STOPWORDS = Set.of(
            "the", "a", "an", "and", "of", "on", "in", "for", "with", "to", "from",
            "at", "by", "is", "are", "was", "were", "be", "based", "using", "via",
            "toward", "towards", "their", "this", "that", "we", "our", "its");

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
     * 知识图谱：论文间关联（向量相似度优先，降级共享关键词）。
     */
    @Override
    public KnowledgeGraphResult graph(Long userId) {
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>().eq(Paper::getUserId, userId));
        if (papers.size() < 2) {
            return new KnowledgeGraphResult(Collections.emptyList(), Collections.emptyList());
        }

        List<KnowledgeGraphLink> links;
        try {
            links = semanticGraph(papers);
        } catch (Exception e) {
            log.warn("ai-service 图谱相似度不可用，降级为共享关键词关联：{}", e.getMessage());
            links = tagGraph(papers);
        }

        List<KnowledgeGraphNode> nodes = papers.stream()
                .map(p -> new KnowledgeGraphNode(
                        p.getId(), p.getTitle(), p.getAuthors(), extractTags(p.getSummary())))
                .toList();
        return new KnowledgeGraphResult(nodes, links);
    }

    /**
     * 调用 ai-service /graph/similarities 取论文两两向量相似度建边。
     * 限制：每篇最多 MAX_DEGREE 条边，总边数上限 MAX_LINKS，低于阈值不建边。
     */
    private List<KnowledgeGraphLink> semanticGraph(List<Paper> papers) throws Exception {
        String aiUrl = appProperties.getAiService().getBaseUrl() + "/graph/similarities";
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("paperIds", papers.stream().map(Paper::getId).toList());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(aiUrl))
                .header("Content-Type", "application/json")
                .header("X-Internal-Token", appProperties.getAiService().getInternalToken())
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

        HttpResponse<String> resp = httpClient.send(
                request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (resp.statusCode() != 200) {
            throw new IllegalStateException("ai-service /graph/similarities 返回 " + resp.statusCode());
        }

        JsonNode similarities = objectMapper.readTree(resp.body()).path("similarities");
        List<KnowledgeGraphLink> links = new ArrayList<>();
        Map<Long, Integer> degree = new HashMap<>();
        // ai-service 已按 score DESC 排序，取前 N 条满足阈值的边
        for (JsonNode s : similarities) {
            if (links.size() >= MAX_LINKS) {
                break;
            }
            long source = s.path("source").asLong();
            long target = s.path("target").asLong();
            double score = s.path("score").asDouble(0.0);
            if (score < SIMILARITY_THRESHOLD) {
                continue;
            }
            if (degree.getOrDefault(source, 0) >= MAX_DEGREE
                    || degree.getOrDefault(target, 0) >= MAX_DEGREE) {
                continue;
            }
            degree.put(source, degree.getOrDefault(source, 0) + 1);
            degree.put(target, degree.getOrDefault(target, 0) + 1);
            links.add(new KnowledgeGraphLink(source, target, score, "semantic"));
        }
        return links;
    }

    /**
     * 降级图谱：两两论文按 title 共享关键词数建边（weight=共享词数）。
     */
    private List<KnowledgeGraphLink> tagGraph(List<Paper> papers) {
        List<KnowledgeGraphLink> links = new ArrayList<>();
        for (int i = 0; i < papers.size() && links.size() < MAX_LINKS; i++) {
            Set<String> wi = keywords(papers.get(i));
            for (int j = i + 1; j < papers.size() && links.size() < MAX_LINKS; j++) {
                Set<String> wj = keywords(papers.get(j));
                int shared = 0;
                for (String k : wi) {
                    if (wj.contains(k)) {
                        shared++;
                    }
                }
                if (shared >= 1) {
                    links.add(new KnowledgeGraphLink(
                            papers.get(i).getId(), papers.get(j).getId(), shared, "tag"));
                }
            }
        }
        return links;
    }

    /** 提取论文标题关键词（小写、去停用词）。 */
    private Set<String> keywords(Paper p) {
        if (p.getTitle() == null) {
            return Collections.emptySet();
        }
        return Arrays.stream(p.getTitle().toLowerCase().split("[^a-z0-9]+"))
                .filter(w -> !w.isEmpty())
                .filter(w -> !STOPWORDS.contains(w))
                .collect(Collectors.toSet());
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
