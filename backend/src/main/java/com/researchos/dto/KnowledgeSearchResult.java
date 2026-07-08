package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/**
 * 知识库搜索结果，与前端 KnowledgeSearchResult 对齐。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@AllArgsConstructor
public class KnowledgeSearchResult {
    private Long paperId;
    private String title;
    private String authors;
    private String snippet;
    private List<String> tags;
    private double score;
}
