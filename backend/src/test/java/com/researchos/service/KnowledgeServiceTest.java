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
}
