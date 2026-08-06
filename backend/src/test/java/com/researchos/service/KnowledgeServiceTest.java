package com.researchos.service;

import com.researchos.config.AppProperties;
import com.researchos.dto.KnowledgeSearchResult;
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

    /** 真实 ObjectMapper（语义搜索需 JSON 序列化/反序列化）。 */
    private final ObjectMapper objectMapper = new ObjectMapper();

    private KnowledgeServiceImpl knowledgeService;

    private static final Long TEST_USER_ID = 1L;

    @BeforeEach
    void setUp() throws Exception {
        // 手动构造（@InjectMocks 对 final ObjectMapper 字段会注入 null）
        knowledgeService = new KnowledgeServiceImpl(paperMapper, appProperties, objectMapper);
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
                        createPaperWithTags("Paper 1", "Machine Learning, NLP"),
                        createPaperWithTags("Paper 2", "Machine Learning, Computer Vision"),
                        createPaperWithTags("Paper 3", "NLP, Transformers")
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
    void testSearch_WithResults() throws Exception {
        // 模拟：用户有两篇论文
        Paper p1 = createPaperWithTags("Deep Learning Survey", "Deep Learning, Survey");
        p1.setId(10L);
        Paper p2 = createPaperWithTags("Attention Is All You Need", "Transformers, Attention");
        p2.setId(11L);
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1, p2));
        stubAiProperties();

        // 模拟 ai-service /search 返回两个命中
        String aiResp = """
                {"results":[
                  {"paperId":10,"section":"abstract","content":"Deep learning methods excel at representation learning.","score":0.87},
                  {"paperId":11,"section":"methods","content":"We propose the Transformer architecture.","score":0.72}
                ]}""";
        stubAiResponse(aiResp);

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "deep learning", 20);

        assertNotNull(results);
        assertEquals(2, results.size());
        assertEquals(10L, results.get(0).getPaperId());
        assertEquals("Deep Learning Survey", results.get(0).getTitle());
        assertTrue(results.get(0).getSnippet().contains("Deep learning methods"));
        assertEquals(0.87, results.get(0).getScore(), 1e-9);
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
    void testSearch_FallbackWhenAiUnavailable() throws Exception {
        Paper p1 = createPaperWithTags("Deep Learning Survey", "AI");
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1));
        stubAiProperties();

        // ai-service 不可达：send 抛异常 -> 降级 LIKE 搜索
        HttpClient fake = (HttpClient) ReflectionTestUtils.getField(knowledgeService, "httpClient");
        doThrow(new java.io.IOException("connection refused"))
                .when(fake)
                .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "learning", 20);

        assertNotNull(results);
        assertEquals(1, results.size());
        assertEquals("Deep Learning Survey", results.get(0).getTitle());
    }

    @Test
    void testSearch_LimitAppliedOnFallback() throws Exception {
        // 10 篇论文，降级时 limit=5 截断
        var papers = new java.util.ArrayList<Paper>();
        for (int i = 0; i < 10; i++) {
            papers.add(createPaperWithTags("Paper " + i, "Tag" + i));
        }
        when(paperMapper.selectList(any())).thenReturn(papers);
        stubAiProperties();

        HttpClient fake = (HttpClient) ReflectionTestUtils.getField(knowledgeService, "httpClient");
        doThrow(new java.io.IOException("connection refused"))
                .when(fake)
                .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "paper", 5);

        assertNotNull(results);
        assertEquals(5, results.size());
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
        summary.put("tags", String.join(",", tags));
        paper.setSummary(summary);
        return paper;
    }

    // ---------- 知识图谱 ----------

    @Test
    void testGraph_WithSemanticLinks() throws Exception {
        // 3 篇论文，ai-service 返回两两相似度
        Paper p1 = createPaperWithTags("Attention Is All You Need", "Transformers");
        p1.setId(10L);
        Paper p2 = createPaperWithTags("BERT: Pre-training of Deep Bidirectional Transformers", "NLP");
        p2.setId(11L);
        Paper p3 = createPaperWithTags("A Survey on Quantum Computing", "Quantum");
        p3.setId(12L);
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1, p2, p3));
        stubAiProperties();

        String aiResp = """
                {"similarities":[
                  {"source":10,"target":11,"score":0.83},
                  {"source":10,"target":12,"score":0.41},
                  {"source":11,"target":12,"score":0.12}
                ]}""";
        stubAiResponse(aiResp);

        var graph = knowledgeService.graph(TEST_USER_ID);

        assertNotNull(graph);
        assertEquals(3, graph.getNodes().size());
        // 阈值 0.55：只有 10-11 这条边
        assertEquals(1, graph.getLinks().size());
        assertEquals(10L, graph.getLinks().get(0).getSource());
        assertEquals(11L, graph.getLinks().get(0).getTarget());
        assertEquals("semantic", graph.getLinks().get(0).getReason());
        assertEquals(0.83, graph.getLinks().get(0).getWeight(), 1e-9);
    }

    @Test
    void testGraph_FallbackWhenAiUnavailable() throws Exception {
        // 两篇共享 "Transformers" 关键词，ai-service 不可达 -> 降级 tag 边
        Paper p1 = createPaperWithTags("A Survey of Transformers", "Transformers");
        p1.setId(10L);
        Paper p2 = createPaperWithTags("Transformers in Vision", "Vision");
        p2.setId(11L);
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList(p1, p2));
        stubAiProperties();

        HttpClient fake = (HttpClient) ReflectionTestUtils.getField(knowledgeService, "httpClient");
        doThrow(new java.io.IOException("connection refused"))
                .when(fake)
                .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));

        var graph = knowledgeService.graph(TEST_USER_ID);

        assertNotNull(graph);
        assertEquals(2, graph.getNodes().size());
        assertEquals(1, graph.getLinks().size());
        assertEquals("tag", graph.getLinks().get(0).getReason());
        assertTrue(graph.getLinks().get(0).getWeight() >= 1.0);
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
    void testGraph_DegreeLimit() throws Exception {
        // 1 篇中心论文 + 8 篇相似论文，但每篇最多 MAX_DEGREE=6 条边
        var papers = new java.util.ArrayList<Paper>();
        Paper center = createPaperWithTags("Deep Learning Core", "AI");
        center.setId(100L);
        papers.add(center);
        StringBuilder json = new StringBuilder("{\"similarities\":[");
        for (long i = 0; i < 8; i++) {
            Paper p = createPaperWithTags("Related Paper " + i, "AI");
            p.setId(200 + i);
            papers.add(p);
            if (i > 0) {
                json.append(",");
            }
            json.append("{\"source\":100,\"target\":").append(200 + i).append(",\"score\":0.9}");
        }
        json.append("]}");
        when(paperMapper.selectList(any())).thenReturn(papers);
        stubAiProperties();
        stubAiResponse(json.toString());

        var graph = knowledgeService.graph(TEST_USER_ID);

        assertNotNull(graph);
        assertEquals(9, graph.getNodes().size());
        // 中心论文最多 6 条边
        assertEquals(6, graph.getLinks().size());
        assertEquals("semantic", graph.getLinks().get(0).getReason());
    }
}
