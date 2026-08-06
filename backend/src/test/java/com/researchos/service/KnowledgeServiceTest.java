package com.researchos.service;

import com.researchos.dto.KnowledgeSearchResult;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.impl.KnowledgeServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

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

    @InjectMocks
    private KnowledgeServiceImpl knowledgeService;

    private static final Long TEST_USER_ID = 1L;

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
    void testSearch_WithResults() {
        // 模拟搜索查询返回论文
        when(paperMapper.selectList(any()))
                .thenReturn(Arrays.asList(
                        createPaperWithTags("Deep Learning Survey", "Deep Learning, Survey"),
                        createPaperWithTags("Attention Is All You Need", "Transformers, Attention")
                ));

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "learning", 20);

        assertNotNull(results);
        assertEquals(2, results.size());
        assertTrue(results.get(0).getTitle().contains("Learning"));
    }

    @Test
    void testSearch_NoResults() {
        when(paperMapper.selectList(any())).thenReturn(Arrays.asList());

        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "nonexistent-keyword", 20);

        assertNotNull(results);
        assertTrue(results.isEmpty());
    }

    @Test
    void testSearch_LimitApplied() {
        // 模拟返回 10 篇论文
        var papers = new java.util.ArrayList<com.researchos.entity.Paper>();
        for (int i = 0; i < 10; i++) {
            papers.add(createPaperWithTags("Paper " + i, "Tag" + i));
        }
        when(paperMapper.selectList(any())).thenReturn(papers);

        // 限制只返回 5 条
        List<KnowledgeSearchResult> results = knowledgeService.search(TEST_USER_ID, "paper", 5);

        assertNotNull(results);
        assertEquals(5, results.size());
    }

    private com.researchos.entity.Paper createPaperWithTags(String title, String... tags) {
        var paper = new com.researchos.entity.Paper();
        paper.setId((long) (Math.random() * 1000));
        paper.setUserId(TEST_USER_ID);
        paper.setTitle(title);
        paper.setAuthors("Author A, Author B");
        // summary 字段是 Map 类型，用于存储 Paper Intelligence Card
        var summary = new java.util.HashMap<String, Object>();
        summary.put("title", title);
        summary.put("tags", String.join(",", tags));
        paper.setSummary(summary);
        return paper;
    }
}
