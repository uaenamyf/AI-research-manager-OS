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
import com.researchos.dto.UserSettings;
import com.researchos.entity.Paper;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.KnowledgeService;
import com.researchos.service.SettingsService;
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
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 知识库服务实现：标签查询、模糊搜索、知识图谱。
 *
 * <p>标签：聚合各论文 summary 中 AI 生成的 tags（{name, category}），
 * 具体 tag 与所属大类（category）都作为 tag 统计。</p>
 *
 * <p>搜索链路：按 user_id 取论文范围 -> title/authors LIKE 模糊搜索
 * （简单模式，不做 RAG 向量检索；ai-service /search 接口保留未删）。</p>
 *
 * <p>图谱链路：按论文 tags 共享情况建边（共享 tag 越多权重越高）；
 * 若论文均无 tags（旧数据），降级为调 ai-service /graph/similarities
 * 向量相似度建边。</p>
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
    // 2026-08-12 myf: 读取用户自定义 Knowledge/RAG 配置（retrieveTopK 覆盖默认 limit）
    private final SettingsService settingsService;

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

    /**
     * 获取标签：聚合各论文 summary 中 AI 生成的 tags（{name, category}）。
     *
     * <p>具体 tag（name）与所属大类（category）都作为 tag 返回：
     * 大类 tag 的 category 为空，表示它自身就是大类（如「人工智能」「工业领域」）；
     * 具体 tag 的 category 指向它所属的大类（如「机器学习」->「人工智能」）。</p>
     */
    @Override
    public List<KnowledgeTagDto> listTags(Long userId) {
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>()
                        .eq(Paper::getUserId, userId)
                        .isNotNull(Paper::getTitle));

        // key(小写) -> 展示名（保留首个出现的大小写）；key -> 计数；key -> 所属大类
        Map<String, String> nameDisplay = new HashMap<>();
        Map<String, Integer> nameCount = new HashMap<>();
        Map<String, String> nameCategory = new HashMap<>();
        Map<String, String> categoryDisplay = new HashMap<>();
        Map<String, Integer> categoryCount = new HashMap<>();

        for (Paper p : papers) {
            for (PaperTag pt : parseTags(p.getSummary())) {
                String name = pt.name().trim();
                String category = pt.category().trim();
                if (!name.isEmpty()) {
                    String nk = name.toLowerCase();
                    nameDisplay.putIfAbsent(nk, name);
                    nameCount.merge(nk, 1, Integer::sum);
                    if (!category.isEmpty()) {
                        // 具体 tag 的 category 用大类展示名（归一化），保证与分组标题一致
                        String ck = category.toLowerCase();
                        categoryDisplay.putIfAbsent(ck, category);
                        nameCategory.put(nk, categoryDisplay.get(ck));
                    }
                }
                if (!category.isEmpty()) {
                    String ck = category.toLowerCase();
                    categoryDisplay.putIfAbsent(ck, category);
                    categoryCount.merge(ck, 1, Integer::sum);
                }
            }
        }

        List<KnowledgeTagDto> tags = new ArrayList<>();
        nameCount.forEach((nk, cnt) -> tags.add(
                new KnowledgeTagDto(null, nameDisplay.get(nk), cnt, nameCategory.get(nk))));
        categoryCount.forEach((ck, cnt) -> tags.add(
                new KnowledgeTagDto(null, categoryDisplay.get(ck), cnt, null)));
        return tags.stream()
                .sorted(Comparator.comparingInt(KnowledgeTagDto::getCount).reversed())
                .toList();
    }

    /**
     * 模糊搜索：直接对 title/authors 做 LIKE 模糊匹配（简单模式）。
     *
     * <p>当前不做 RAG 向量检索；ai-service /search 接口与 semanticSearch
     * 方法保留未删，后续可恢复。</p>
     */
    @Override
    public List<KnowledgeSearchResult> search(Long userId, String query, int limit) {
        // 1. 取该用户论文范围（多租户隔离）
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>().eq(Paper::getUserId, userId));
        if (papers.isEmpty()) {
            return Collections.emptyList();
        }

        // 2026-08-12 myf: 用户自定义 retrieveTopK 覆盖默认 limit（Settings -> Knowledge）
        int effectiveLimit = limit;
        try {
            UserSettings settings = settingsService.getSettings(userId);
            if (settings != null && settings.getKnowledge() != null
                    && settings.getKnowledge().getRetrieveTopK() != null
                    && settings.getKnowledge().getRetrieveTopK() > 0) {
                effectiveLimit = settings.getKnowledge().getRetrieveTopK();
            }
        } catch (Exception e) {
            log.warn("读取用户 Knowledge 配置失败，使用默认 limit={}: userId={}", limit, userId, e);
        }

        // 2. title/authors 模糊匹配
        return fallbackSearch(papers, query, effectiveLimit);
    }

    /**
     * 按标签查论文：匹配 summary tags 中 name 或 category（忽略大小写）。
     *
     * <p>与 listTags 的归一化逻辑一致（小写比较），点击前端展示的任意
     * tag（具体 tag 或大类）都能命中对应论文。</p>
     */
    @Override
    public List<KnowledgeSearchResult> papersByTag(Long userId, String tag) {
        String key = tag.trim().toLowerCase();
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>().eq(Paper::getUserId, userId));
        return papers.stream()
                .filter(p -> {
                    for (PaperTag pt : parseTags(p.getSummary())) {
                        if (pt.name().trim().toLowerCase().equals(key)
                                || pt.category().trim().toLowerCase().equals(key)) {
                            return true;
                        }
                    }
                    return false;
                })
                .map(p -> {
                    Map<String, Object> s = p.getSummary();
                    String realTitle = s != null ? str(s.get("title")) : p.getTitle();
                    String realAuthors = s != null ? str(s.get("authors")) : p.getAuthors();
                    return new KnowledgeSearchResult(
                            p.getId(), realTitle, realAuthors,
                            realTitle, extractTags(p.getSummary()), 1.0
                    );
                })
                .toList();
    }

    /**
     * 知识图谱：按论文 tags 相关度建边。
     *
     * <p>主路径：两两论文共享 tag（含大类）越多权重越高；
     * 若论文均无 tags（旧数据），降级为向量相似度建边（semanticGraph）。</p>
     */
    @Override
    public KnowledgeGraphResult graph(Long userId) {
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>().eq(Paper::getUserId, userId));
        if (papers.size() < 2) {
            return new KnowledgeGraphResult(Collections.emptyList(), Collections.emptyList());
        }

        List<KnowledgeGraphLink> links = tagGraph(papers);
        // 旧数据没有 tags 时降级为向量相似度建边
        if (links.isEmpty()) {
            try {
                links = semanticGraph(papers);
            } catch (Exception e) {
                log.warn("ai-service 图谱相似度不可用：{}", e.getMessage());
            }
        }

        // 2026-08-09 myf: 节点标题/作者取 summary 真实值，空则回退文件名/作者
        List<KnowledgeGraphNode> nodes = papers.stream()
                .map(p -> {
                    Map<String, Object> s = p.getSummary();
                    String realTitle = s != null && !str(s.get("title")).isEmpty()
                            ? str(s.get("title")) : p.getTitle();
                    String realAuthors = s != null && !str(s.get("authors")).isEmpty()
                            ? str(s.get("authors")) : p.getAuthors();
                    return new KnowledgeGraphNode(
                            p.getId(), realTitle, realAuthors, extractTags(p.getSummary()));
                })
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
     * 图谱主路径：两两论文按 tags 共享数建边（weight=共享 tag 数）。
     *
     * <p>共享判断同时覆盖具体 tag（name）与所属大类（category）：
     * 「机器学习」与「强化学习」同属「人工智能」，即可通过大类产生关联。</p>
     */
    private List<KnowledgeGraphLink> tagGraph(List<Paper> papers) {
        List<KnowledgeGraphLink> links = new ArrayList<>();
        for (int i = 0; i < papers.size() && links.size() < MAX_LINKS; i++) {
            Set<String> si = tagNames(papers.get(i));
            if (si.isEmpty()) {
                continue;
            }
            for (int j = i + 1; j < papers.size() && links.size() < MAX_LINKS; j++) {
                Set<String> sj = tagNames(papers.get(j));
                if (sj.isEmpty()) {
                    continue;
                }
                int shared = 0;
                for (String k : si) {
                    if (sj.contains(k)) {
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

    /** 提取论文的全部 tag 名（具体 tag + 大类，小写去空白，用于建边匹配）。 */
    private Set<String> tagNames(Paper p) {
        Set<String> names = new HashSet<>();
        for (PaperTag pt : parseTags(p.getSummary())) {
            if (!pt.name().isBlank()) {
                names.add(pt.name().trim().toLowerCase());
            }
            if (!pt.category().isBlank()) {
                names.add(pt.category().trim().toLowerCase());
            }
        }
        return names;
    }

    /**
     * 模糊搜索：title/authors LIKE 匹配（内存过滤）。
     *
     * <p>真实标题/作者存在 summary（Paper Intelligence Card）中，paper.title
     * 仅为上传文件名，故匹配与展示均优先用 summary 内的 title/authors，
     * 文件名作为兜底参与匹配。</p>
     */
    private List<KnowledgeSearchResult> fallbackSearch(List<Paper> papers, String query, int limit) {
        return papers.stream()
                .filter(p -> {
                    Map<String, Object> s = p.getSummary();
                    String realTitle = s != null ? str(s.get("title")) : "";
                    String realAuthors = s != null ? str(s.get("authors")) : "";
                    return containsIgnoreCase(realTitle, query)
                            || containsIgnoreCase(realAuthors, query)
                            || containsIgnoreCase(p.getTitle(), query);
                })
                .limit(limit)
                .map(p -> {
                    Map<String, Object> s = p.getSummary();
                    String realTitle = s != null ? str(s.get("title")) : p.getTitle();
                    String realAuthors = s != null ? str(s.get("authors")) : p.getAuthors();
                    return new KnowledgeSearchResult(
                            p.getId(), realTitle, realAuthors,
                            realTitle, extractTags(p.getSummary()), 1.0
                    );
                })
                .toList();
    }

    private boolean containsIgnoreCase(String text, String keyword) {
        return text != null && text.toLowerCase().contains(keyword.toLowerCase());
    }

    /**
     * 从 summary（Paper Intelligence Card JSON）提取 tags 名称列表。
     * 兼容三种存储形态：对象数组 [{"name","category"}]、字符串数组、逗号分隔字符串。
     */
    private List<String> extractTags(Map<String, Object> summary) {
        if (summary == null || !(summary.get("tags") instanceof List<?> raw)) {
            return Collections.emptyList();
        }
        List<String> names = new ArrayList<>();
        for (Object item : raw) {
            if (item instanceof Map<?, ?> m) {
                Object name = m.get("name");
                if (name != null && !name.toString().isBlank()) {
                    names.add(name.toString());
                }
            } else if (item != null && !item.toString().isBlank()) {
                names.add(item.toString());
            }
        }
        return names;
    }

    /**
     * 解析 summary 中的 tags 为 PaperTag 列表（兼容对象数组/字符串数组）。
     */
    private List<PaperTag> parseTags(Map<String, Object> summary) {
        if (summary == null || !(summary.get("tags") instanceof List<?> raw)) {
            return Collections.emptyList();
        }
        List<PaperTag> tags = new ArrayList<>();
        for (Object item : raw) {
            if (item instanceof Map<?, ?> m) {
                tags.add(new PaperTag(
                        str(m.get("name")), str(m.get("category"))));
            } else if (item != null) {
                tags.add(new PaperTag(item.toString(), ""));
            }
        }
        return tags;
    }

    private String str(Object o) {
        return o == null ? "" : o.toString().trim();
    }

    /** summary tags 中的单个标签：name + 所属大类 category。 */
    private record PaperTag(String name, String category) {
    }
}
