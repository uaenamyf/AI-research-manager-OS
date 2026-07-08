package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 标签 DTO，与前端 KnowledgeTag 对齐。
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
}
