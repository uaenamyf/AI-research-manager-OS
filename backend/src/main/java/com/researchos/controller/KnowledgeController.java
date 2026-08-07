package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.security.CurrentUserResolver;
import com.researchos.dto.KnowledgeGraphResult;
import com.researchos.dto.KnowledgeSearchResult;
import com.researchos.dto.KnowledgeTagDto;
import com.researchos.service.KnowledgeService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 知识库控制器。
 *
 * @author myf
 * @since 2026-07-08
 */
@RestController
@RequestMapping("/api/knowledge")
@RequiredArgsConstructor
public class KnowledgeController {

    private final KnowledgeService knowledgeService;
    private final CurrentUserResolver currentUserResolver;

    @GetMapping("/tags")
    public ApiResponse<List<KnowledgeTagDto>> tags() {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(knowledgeService.listTags(userId));
    }

    @GetMapping("/tags/{tag}/papers")
    public ApiResponse<List<KnowledgeSearchResult>> papersByTag(@PathVariable String tag) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(knowledgeService.papersByTag(userId, tag));
    }

    @GetMapping("/search")
    public ApiResponse<List<KnowledgeSearchResult>> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "20") int limit) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(knowledgeService.search(userId, q, limit));
    }

    @GetMapping("/graph")
    public ApiResponse<KnowledgeGraphResult> graph() {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(knowledgeService.graph(userId));
    }
}
