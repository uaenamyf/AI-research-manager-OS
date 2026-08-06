package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.dto.KnowledgeSearchResult;
import com.researchos.dto.KnowledgeTagDto;
import com.researchos.entity.Paper;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.KnowledgeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 知识库服务实现：标签查询、关联搜索。
 * MVP 版：基于 paper.title/authors 做简单搜索，后续可接向量库。
 *
 * @author myf
 * @since 2026-07-08
 */
@Service
@RequiredArgsConstructor
public class KnowledgeServiceImpl implements KnowledgeService {

    private final PaperMapper paperMapper;

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
     * 关联搜索（MVP 版：按 title 模糊匹配）。
     */
    @Override
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
