package com.researchos.service;

import java.util.List;
import java.util.Map;

/**
 * 文献检索服务：转发 ai-service 的 literature-search-mcp 检索能力。
 *
 * @author myf
 * @since 2026-08-12
 */
public interface LiteratureService {

    /**
     * 检索学术文献（PubMed/Europe PMC/bioRxiv/Crossref/OpenAlex/Semantic Scholar/arXiv）。
     *
     * @return ai-service 透传的 SearchResponse（results/source_statuses/统计）
     */
    Map<String, Object> search(String query, Integer limit, List<String> sources,
                               Integer yearFrom, Integer yearTo, Boolean openAccess);

    /** 列出支持的学术数据源及凭据配置状态。 */
    Map<String, Object> sources();
}
