package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.LiteratureService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 文献检索控制器：经 ai-service 的 MCP 学术搜索提供跨库文献检索。
 *
 * @author myf
 * @since 2026-08-12
 */
@RestController
@RequestMapping("/api/literature")
@RequiredArgsConstructor
public class LiteratureController {

    private final LiteratureService literatureService;
    private final CurrentUserResolver currentUserResolver;

    /** 检索学术文献（PubMed/Europe PMC/bioRxiv/Crossref/OpenAlex/Semantic Scholar/arXiv）。 */
    @GetMapping("/search")
    public ApiResponse<Map<String, Object>> search(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "10") Integer limit,
            @RequestParam(required = false) List<String> sources,
            @RequestParam(name = "year_from", required = false) Integer yearFrom,
            @RequestParam(name = "year_to", required = false) Integer yearTo,
            @RequestParam(name = "open_access", required = false) Boolean openAccess) {
        currentUserResolver.requireUserId();
        return ApiResponse.ok(literatureService.search(
                query, limit, sources, yearFrom, yearTo, openAccess));
    }

    /** 列出支持的学术数据源及凭据配置状态。 */
    @GetMapping("/sources")
    public ApiResponse<Map<String, Object>> sources() {
        currentUserResolver.requireUserId();
        return ApiResponse.ok(literatureService.sources());
    }
}
