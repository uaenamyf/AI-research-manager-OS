package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 标签 DTO，与前端 KnowledgeTag 对齐。
 *
 * <p>category 为标签所属大类（如「机器学习」->「人工智能」）；
 * 大类本身也可作为独立 tag（category 为空表示它自身就是大类）。</p>
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@AllArgsConstructor
public class KnowledgeTagDto {
    private Long id;
    private String name;
    private int count;
    private String category;
}
