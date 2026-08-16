package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.entity.Paper;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.CitationService;
import com.researchos.service.CitationService.Format;
import com.researchos.service.PaperService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 引用格式渲染控制器。
 *
 * @author myf
 * @since 2026-08-15
 */
@RestController
@RequiredArgsConstructor
public class CitationController {

    private final CitationService citationService;
    private final PaperService paperService;
    private final CurrentUserResolver currentUserResolver;

    /** 单篇论文引用（默认 APA） */
    @GetMapping("/api/papers/{id}/citation")
    public ApiResponse<Map<String, String>> getCitation(
            @PathVariable Long id,
            @RequestParam(defaultValue = "APA") Format format) {
        Long userId = currentUserResolver.requireUserId();
        Paper paper = paperService.requirePaperOwnedBy(id, userId);
        String citation = citationService.render(paper, format);
        return ApiResponse.ok(Map.of("citation", citation, "format", format.name()));
    }

    /** 批量生成参考文献列表 */
    @PostMapping("/api/citation/bibliography")
    public ApiResponse<Map<String, Object>> getBibliography(
            @RequestBody Map<String, Object> body,
            @RequestParam(defaultValue = "APA") Format format) {
        currentUserResolver.requireUserId();
        @SuppressWarnings("unchecked")
        List<Integer> ids = (List<Integer>) body.get("paperIds");
        List<Long> paperIds = ids.stream().map(Long::valueOf).toList();
        List<Paper> papers = paperIds.stream()
                .map(id -> paperService.getById(id))
                .filter(p -> p != null)
                .toList();
        List<String> citations = citationService.renderBatch(papers, format);
        return ApiResponse.ok(Map.of(
                "citations", citations,
                "format", format.name(),
                "count", citations.size()));
    }
}