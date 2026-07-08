package com.researchos.controller;

import com.researchos.dto.ReviewGenerateRequest;
import com.researchos.entity.AiTask;
import com.researchos.service.AiTaskService;
import com.researchos.common.response.ApiResponse;
import com.researchos.security.CurrentUserResolver;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Review 控制器：生成综述、查询任务。
 *
 * @author myf
 * @since 2026-07-08
 */
@RestController
@RequestMapping("/api/review")
@RequiredArgsConstructor
public class ReviewController {

    private final AiTaskService aiTaskService;
    private final CurrentUserResolver currentUserResolver;

    @PostMapping("/generate")
    public ApiResponse<Map<String, Long>> generate(@Valid @RequestBody ReviewGenerateRequest req) {
        Long userId = currentUserResolver.requireUserId();
        Long taskId = aiTaskService.createReviewTask(userId, req);
        return ApiResponse.ok(Map.of("taskId", taskId));
    }

    @GetMapping("/{taskId}")
    public ApiResponse<AiTask> getTask(@PathVariable Long taskId) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(aiTaskService.requireTaskOwnedBy(taskId, userId));
    }
}
