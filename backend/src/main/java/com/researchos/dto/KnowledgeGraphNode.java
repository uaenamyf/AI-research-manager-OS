package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/**
 * 知识图谱节点（一篇论文）。
 *
 * @author myf
 * @since 2026-08-06
 */
@Data
@AllArgsConstructor
public class KnowledgeGraphNode {
    private Long id;
    private String title;
    private String authors;
    private List<String> tags;
}
