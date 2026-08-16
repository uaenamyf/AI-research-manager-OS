package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.entity.Annotation;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.PaperService;
import com.researchos.service.impl.AnnotationServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 批注控制器（Phase 3）。
 *
 * @author myf
 * @since 2026-08-15
 */
@RestController
@RequiredArgsConstructor
public class AnnotationController {

    private final AnnotationServiceImpl annotationService;
    private final PaperService paperService;
    private final CurrentUserResolver currentUserResolver;

    /** 获取论文的所有批注 */
    @GetMapping("/api/papers/{paperId}/annotations")
    public ApiResponse<List<Annotation>> listAnnotations(@PathVariable Long paperId) {
        Long userId = currentUserResolver.requireUserId();
        paperService.requirePaperOwnedBy(paperId, userId);
        return ApiResponse.ok(annotationService.listByPaper(paperId, userId));
    }

    /** 创建批注 */
    @PostMapping("/api/papers/{paperId}/annotations")
    public ApiResponse<Annotation> createAnnotation(
            @PathVariable Long paperId,
            @RequestBody Annotation annotation) {
        Long userId = currentUserResolver.requireUserId();
        paperService.requirePaperOwnedBy(paperId, userId);
        annotation.setPaperId(paperId);
        annotation.setUserId(userId);
        annotationService.save(annotation);
        return ApiResponse.ok(annotation);
    }

    /** 更新批注（笔记内容/颜色） */
    @PutMapping("/api/annotations/{id}")
    public ApiResponse<Annotation> updateAnnotation(
            @PathVariable Long id,
            @RequestBody Annotation update) {
        Long userId = currentUserResolver.requireUserId();
        Annotation existing = annotationService.getById(id);
        if (existing == null || !existing.getUserId().equals(userId)) {
            return ApiResponse.fail(404, "Annotation not found");
        }
        if (update.getNote() != null) existing.setNote(update.getNote());
        if (update.getColor() != null) existing.setColor(update.getColor());
        annotationService.updateById(existing);
        return ApiResponse.ok(existing);
    }

    /** 删除批注 */
    @DeleteMapping("/api/annotations/{id}")
    public ApiResponse<Void> deleteAnnotation(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        Annotation existing = annotationService.getById(id);
        if (existing == null || !existing.getUserId().equals(userId)) {
            return ApiResponse.fail(404, "Annotation not found");
        }
        annotationService.removeById(id);
        return ApiResponse.ok();
    }
}