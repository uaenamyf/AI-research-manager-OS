package com.researchos.service;

import com.researchos.config.AppProperties;
import com.researchos.dto.KnowledgeSearchResult;
import com.researchos.dto.UserSettings;
import com.researchos.entity.Paper;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.impl.KnowledgeServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Field;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;

/**
 * 知识库服务单元测试。
 *
 * @author myf
 * @since 2026-07-23
 */
@ExtendWith(MockitoExtension.class)
class KnowledgeServiceTest {

    @Mock
    private PaperMapper paperMapper;

    @Mock
    private AppProperties appProperties;

    @Mock
    private SettingsService settingsService;

    /** 真实 ObjectMapper（语义搜索需 JSON 序列化/反序列化）。 */
    private final ObjectMapper objectMapper = new ObjectMapper();

    private KnowledgeServiceImpl knowledgeService;

    private static final Long TEST_USER_ID = 1L;

    @BeforeEach
    void setUp() throws Exception {
        // 手动构造（@InjectMocks 对 final ObjectMapper 字段会注入 null）
        knowledgeService = new KnowledgeServiceImpl(paperMapper, appProperties, objectMapper, settingsService);
        // 反射替换 httpClient，避免真实网络请求
        Field f = KnowledgeServiceImpl.class.getDeclaredField("httpClient");
        f.setAccessible(true);
        f.set(knowledgeService, mock(HttpClient.class));
    }

    private void stubAiProperties() {
        AppProperties.AiService ai = new AppProperties.AiService();
        ai.setBaseUrl("http://localhost:8000");
        ai.setInternalToken("test-token");
        when(appProperties.getAiService()).thenReturn(ai);
    }

    @Test
    void testListTags_WithTags() {
        // 模拟：从论文表中提取标签聚合结果
        when(paperMapper.selectList(any()))
                .thenReturn(Arrays.asList(
                        createPaperWithTags("Paper 1", "Machine Learning", "NLP"),
                        createPaperWithTags("Paper 2", "Machine Learning", "Computer Vision"),
                        createPaperWithTags("Paper 3", "NLP", "Transformers")
                ));

        var result = knowledgeService.listTags(TEST_USER_ID);

        assertNotNull(result);
        // 应该有 4 个唯一标签：Machine Learning(2), NLP(2), Computer Vision(1), Transformers(1)
        assertTrue(result.size() >= 3);
    }

    @Test
    void testListTags_NoPapers() {
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList());

        var result = knowledgeService.listTags(TEST_USER_ID);

        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void testSearch_WithResults() {
        // 简单模式：title/authors LIKE 模糊匹配
        Paper p1 = createPaperWithTags("Deep Learning Survey", "Deep Learning", "Survey");
        p1.setId(10L);
        Paper p2 = createPaperWithTags("Attention Is All You Need", "Transformers", "Attention");
        p2.setId(11L);
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1, p2));

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "deep learning", 20);

        assertNotNull(results);
        assertEquals(1, results.size());
        assertEquals(10L, results.get(0).getPaperId());
        assertEquals("Deep Learning Survey", results.get(0).getTitle());
        // 简单模式无相似度分数，score 恒为 1.0
        assertEquals(1.0, results.get(0).getScore(), 1e-9);
        // tags 从 summary 提取
        assertTrue(results.get(0).getTags().contains("Deep Learning"));
    }

    @Test
    void testSearch_NoPapers() {
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList());

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "nonexistent-keyword", 20);

        assertNotNull(results);
        assertTrue(results.isEmpty());
    }

    @Test
    void testSearch_LikeMatchOnAuthors() {
        // 命中 authors 也能匹配（简单模式匹配 title + authors + 文件名）
        Paper p1 = createPaperWithTags("Deep Learning Survey", "AI");
        p1.setId(10L);
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1));

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "author b", 20);

        assertNotNull(results);
        assertEquals(1, results.size());
        assertEquals("Deep Learning Survey", results.get(0).getTitle());
    }

    @Test
    void testSearch_LimitApplied() {
        // 10 篇论文，limit=5 截断
        var papers = new java.util.ArrayList<Paper>();
        for (int i = 0; i < 10; i++) {
            papers.add(createPaperWithTags("Paper " + i, "Tag" + i));
        }
        when(paperMapper.selectList(any())).thenReturn(papers);

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "paper", 5);

        assertNotNull(results);
        assertEquals(5, results.size());
    }

    @Test
    void testSearch_UserRetrieveTopKOverridesLimit() {
        // 用户设置 retrieveTopK=3 时覆盖默认 limit=20
        var papers = new java.util.ArrayList<Paper>();
        for (int i = 0; i < 10; i++) {
            papers.add(createPaperWithTags("Paper " + i, "Tag" + i));
        }
        when(paperMapper.selectList(any())).thenReturn(papers);
        UserSettings s = new UserSettings();
        UserSettings.Knowledge k = new UserSettings.Knowledge();
        k.setRetrieveTopK(3);
        s.setKnowledge(k);
        when(settingsService.getSettings(TEST_USER_ID)).thenReturn(s);

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "paper", 20);

        assertNotNull(results);
        assertEquals(3, results.size());
    }

    private void stubAiResponse(String jsonBody) throws Exception {
        HttpResponse<String> resp = mock(HttpResponse.class);
        when(resp.statusCode()).thenReturn(200);
        when(resp.body()).thenReturn(jsonBody);
        HttpClient fake = (HttpClient) ReflectionTestUtils.getField(knowledgeService, "httpClient");
        doReturn(resp)
                .when(fake)
                .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    private Paper createPaperWithTags(String title, String... tags) {
        var paper = new Paper();
        paper.setId((long) (Math.random() * 1000));
        paper.setUserId(TEST_USER_ID);
        paper.setTitle(title);
        paper.setAuthors("Author A, Author B");
        // summary 字段是 Map 类型，用于存储 Paper Intelligence Card
        var summary = new HashMap<String, Object>();
        summary.put("title", title);
        summary.put("authors", "Author A, Author B");
        // tags 存字符串数组（与 parseTags/extractTags 的 List 解析兼容）
        summary.put("tags", Arrays.asList(tags));
        paper.setSummary(summary);
        return paper;
    }

    // ---------- 知识图谱 ----------

    @Test
    void testGraph_BySharedTags() {
        // 3 篇论文：p1/p2 共享 Transformers 标签，p3 独立
        Paper p1 = createPaperWithTags("Attention Is All You Need", "Transformers");
        p1.setId(10L);
        Paper p2 = createPaperWithTags("BERT: Pre-training of Deep Bidirectional Transformers", "Transformers", "NLP");
        p2.setId(11L);
        Paper p3 = createPaperWithTags("A Survey on Quantum Computing", "Quantum");
        p3.setId(12L);
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1, p2, p3));

        var graph = knowledgeService.graph(TEST_USER_ID);

        assertNotNull(graph);
        assertEquals(3, graph.getNodes().size());
        // 只有 p1-p2 共享标签，1 条 tag 边
        assertEquals(1, graph.getLinks().size());
        assertEquals(10L, graph.getLinks().get(0).getSource());
        assertEquals(11L, graph.getLinks().get(0).getTarget());
        assertEquals("tag", graph.getLinks().get(0).getReason());
        assertTrue(graph.getLinks().get(0).getWeight() >= 1.0);
    }

    @Test
    void testGraph_SemanticFallbackWhenNoTags() throws Exception {
        // 论文均无 tags -> tagGraph 无边 -> 降级调 ai-service 向量相似度建边
        Paper p1 = createPaperWithTags("Attention Is All You Need");
        p1.setId(10L);
        Paper p2 = createPaperWithTags("BERT");
        p2.setId(11L);
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1, p2));
        stubAiProperties();

        String aiResp = """
                {"similarities":[
                  {"source":10,"target":11,"score":0.83}
                ]}""";
        stubAiResponse(aiResp);

        var graph = knowledgeService.graph(TEST_USER_ID);

        assertNotNull(graph);
        assertEquals(2, graph.getNodes().size());
        assertEquals(1, graph.getLinks().size());
        assertEquals("semantic", graph.getLinks().get(0).getReason());
        assertEquals(0.83, graph.getLinks().get(0).getWeight(), 1e-9);
    }

    @Test
    void testGraph_SinglePaperReturnsEmpty() {
        Paper p1 = createPaperWithTags("Only Paper", "AI");
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1));

        var graph = knowledgeService.graph(TEST_USER_ID);

        assertNotNull(graph);
        assertTrue(graph.getNodes().isEmpty());
        assertTrue(graph.getLinks().isEmpty());
    }

    @Test
    void testGraph_SharedTagCountAsWeight() {
        // 共享 2 个标签的论文对权重 = 2（> 共享 1 个的论文对）
        Paper p1 = createPaperWithTags("Deep Learning Core", "AI", "Neural Networks");
        p1.setId(100L);
        Paper p2 = createPaperWithTags("Neural Network Survey", "AI", "Neural Networks");
        p2.setId(200L);
        Paper p3 = createPaperWithTags("Unrelated Paper", "Biology");
        p3.setId(300L);
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1, p2, p3));

        var graph = knowledgeService.graph(TEST_USER_ID);

        assertNotNull(graph);
        assertEquals(3, graph.getNodes().size());
        assertEquals(1, graph.getLinks().size());
        // p1-p2 共享 "ai" 与 "neural networks" 两个标签
        assertEquals(2, graph.getLinks().get(0).getWeight());
        assertEquals("tag", graph.getLinks().get(0).getReason());
    }
}
