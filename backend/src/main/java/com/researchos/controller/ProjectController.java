package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.common.response.PageResponse;
import com.researchos.security.CurrentUserResolver;
import com.researchos.dto.ProjectCreateRequest;
import com.researchos.entity.ResearchProject;
import com.researchos.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 项目控制器。
 *
 * @author myf
 * @since 2026-07-08
 */
@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;
    private final CurrentUserResolver currentUserResolver;

    @PostMapping
    public ApiResponse<ResearchProject> create(@Valid @RequestBody ProjectCreateRequest req) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(projectService.create(userId, req));
    }

    @GetMapping
    public ApiResponse<PageResponse<ResearchProject>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(projectService.list(userId, page, size));
    }

    @GetMapping("/{id}")
    public ApiResponse<ResearchProject> detail(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(projectService.requireProjectOwnedBy(id, userId));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        projectService.requireProjectOwnedBy(id, userId);
        projectService.removeById(id);
        return ApiResponse.ok();
    }
}
