package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.dto.KnowledgeSearchResult;
import com.researchos.dto.KnowledgeTagDto;
import com.researchos.entity.Paper;
import com.researchos.mapper.PaperMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

/**
 * 知识库服务：标签查询、关联搜索。
 * MVP 版：基于 paper.title/authors 做简单搜索，后续可接向量库。
 *
 * @author myf
 * @since 2026-07-08
 */
@Service
@RequiredArgsConstructor
public class KnowledgeService {

    private final PaperMapper paperMapper;

    /**
     * 获取标签（MVP 暂用 domain 字段聚合）。
     */
    public List<KnowledgeTagDto> listTags(Long userId) {
        // 简化：按 domain 分组计数
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>()
                        .eq(Paper::getUserId, userId)
                        .isNotNull(Paper::getTitle));
        // 实际应查标签表，MVP 用 title 关键词占位
        return Collections.emptyList();
    }

    /**
     * 关联搜索（MVP 版：按 title 模糊匹配）。
     */
    public List<KnowledgeSearchResult> search(Long userId, String query, int limit) {
        List<Paper> papers = paperMapper.selectList(
                new LambdaQueryWrapper<Paper>()
                        .eq(Paper::getUserId, userId)
                        .and(w -> w.like(Paper::getTitle, query)
                                .or().like(Paper::getAuthors, query))
                        .last("LIMIT " + limit));
        return papers.stream().map(p -> new KnowledgeSearchResult(
                p.getId(), p.getTitle(), p.getAuthors(),
                p.getTitle(), Collections.emptyList(), 1.0
        )).toList();
    }
}
