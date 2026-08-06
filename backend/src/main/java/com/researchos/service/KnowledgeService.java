package com.researchos.service;

import com.researchos.dto.KnowledgeGraphResult;
import com.researchos.dto.KnowledgeSearchResult;
import com.researchos.dto.KnowledgeTagDto;

import java.util.List;

/**
 * 知识库服务：标签查询、关联搜索、知识图谱。
 * MVP 版：基于 paper.title/authors 做简单搜索，后续可接向量库。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface KnowledgeService {

    /**
     * 获取标签（MVP 暂用 domain 字段聚合）。
     */
    List<KnowledgeTagDto> listTags(Long userId);

    /**
     * 关联搜索（MVP 版：按 title 模糊匹配）。
     */
    List<KnowledgeSearchResult> search(Long userId, String query, int limit);

    /**
     * 知识图谱：论文间关联（向量相似度优先，降级共享关键词）。
     */
    KnowledgeGraphResult graph(Long userId);
}
