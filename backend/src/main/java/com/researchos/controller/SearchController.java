package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.entity.Paper;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.PaperService;
import com.researchos.service.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 全文搜索控制器（Phase 5）。
 *
 * @author myf
 * @since 2026-08-15
 */
@RestController
@RequiredArgsConstructor
public class SearchController {

    private final PaperService paperService;
    private final ProjectService projectService;
    private final CurrentUserResolver currentUserResolver;

    /** 全文搜索：匹配论文标题和作者 */
    @GetMapping("/api/projects/{projectId}/papers/search")
    public ApiResponse<Map<String, Object>> searchPapers(
            @PathVariable Long projectId,
            @RequestParam String q) {
        Long userId = currentUserResolver.requireUserId();
        projectService.requireProjectOwnedBy(projectId, userId);

        List<Paper> papers = paperService.lambdaQuery()
                .eq(Paper::getProjectId, projectId)
                .eq(Paper::getUserId, userId)
                .and(w -> w.like(Paper::getTitle, q)
                        .or().like(Paper::getAuthors, q)
                        .or().like(Paper::getDoi, q))
                .select(Paper::getId, Paper::getTitle, Paper::getAuthors,
                        Paper::getYear, Paper::getStatus, Paper::getReadingStatus,
                        Paper::getStarRating)
                .list();

        return ApiResponse.ok(Map.of(
                "results", papers,
                "count", papers.size()));
    }
}