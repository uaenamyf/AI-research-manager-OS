package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 知识图谱边（两篇论文的关联）。
 *
 * <p>reason 区分关联来源：semantic（向量相似度）/ tag（共享关键词降级）。</p>
 *
 * @author myf
 * @since 2026-08-06
 */
@Data
@AllArgsConstructor
public class KnowledgeGraphLink {
    private Long source;
    private Long target;
    private double weight;
    private String reason;
}
