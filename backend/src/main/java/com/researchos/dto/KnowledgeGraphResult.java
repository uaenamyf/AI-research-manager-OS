package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/**
 * 知识图谱结果（节点 + 边），供前端力导向图渲染。
 *
 * @author myf
 * @since 2026-08-06
 */
@Data
@AllArgsConstructor
public class KnowledgeGraphResult {
    private List<KnowledgeGraphNode> nodes;
    private List<KnowledgeGraphLink> links;
}
