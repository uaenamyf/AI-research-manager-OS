package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.entity.Paper;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.ExportService;
import com.researchos.service.PaperService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 文献导出控制器（BibTeX/RIS Phase 4）。
 *
 * @author myf
 * @since 2026-08-15
 */
@RestController
@RequiredArgsConstructor
public class ExportController {

    private final ExportService exportService;
    private final PaperService paperService;
    private final CurrentUserResolver currentUserResolver;

    /** 单篇论文导出 BibTeX */
    @GetMapping("/api/papers/{id}/export/bibtex")
    public ApiResponse<Map<String, String>> exportBibtex(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        Paper paper = paperService.requirePaperOwnedBy(id, userId);
        return ApiResponse.ok(Map.of(
                "bibtex", exportService.toBibtex(paper),
                "format", "bibtex"));
    }

    /** 单篇论文导出 RIS */
    @GetMapping("/api/papers/{id}/export/ris")
    public ApiResponse<Map<String, String>> exportRis(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        Paper paper = paperService.requirePaperOwnedBy(id, userId);
        return ApiResponse.ok(Map.of(
                "ris", exportService.toRis(paper),
                "format", "ris"));
    }

    /** 批量导出 BibTeX */
    @PostMapping("/api/papers/export/bibtex")
    public ApiResponse<Map<String, String>> exportBibtexBatch(@RequestBody Map<String, List<Integer>> body) {
        currentUserResolver.requireUserId();
        List<Long> ids = body.get("paperIds").stream().map(Long::valueOf).toList();
        List<Paper> papers = ids.stream()
                .map(id -> paperService.getById(id))
                .filter(p -> p != null)
                .toList();
        return ApiResponse.ok(Map.of(
                "bibtex", exportService.toBibtexBatch(papers),
                "format", "bibtex",
                "count", String.valueOf(papers.size())));
    }

    /** 批量导出 RIS */
    @PostMapping("/api/papers/export/ris")
    public ApiResponse<Map<String, String>> exportRisBatch(@RequestBody Map<String, List<Integer>> body) {
        currentUserResolver.requireUserId();
        List<Long> ids = body.get("paperIds").stream().map(Long::valueOf).toList();
        List<Paper> papers = ids.stream()
                .map(id -> paperService.getById(id))
                .filter(p -> p != null)
                .toList();
        return ApiResponse.ok(Map.of(
                "ris", exportService.toRisBatch(papers),
                "format", "ris",
                "count", String.valueOf(papers.size())));
    }
}