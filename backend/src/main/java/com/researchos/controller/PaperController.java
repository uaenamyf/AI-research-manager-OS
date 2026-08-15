package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.common.response.PageResponse;
import com.researchos.security.CurrentUserResolver;
import com.researchos.dto.PresignedPostResponse;
import com.researchos.dto.UploadUrlRequest;
import com.researchos.service.StorageService;
import com.researchos.dto.*;
import com.researchos.entity.Paper;
import com.researchos.service.PaperService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 论文控制器。
 *
 * @author myf
 * @since 2026-07-08
 */
@RestController
@RequiredArgsConstructor
public class PaperController {

    private final PaperService paperService;
    private final StorageService storageService;
    private final CurrentUserResolver currentUserResolver;

    /** 请求 presigned POST（前端直传 S3 步骤 1） */
    @PostMapping("/api/projects/{projectId}/papers/upload-url")
    public ApiResponse<PresignedPostResponse> getUploadUrl(
            @PathVariable Long projectId,
            @Valid @RequestBody UploadUrlRequest req) {
        currentUserResolver.requireUserId();
        return ApiResponse.ok(storageService.presignUpload(req.getFileName(), req.getContentType()));
    }

    /** 创建论文记录 + 触发 AI 分析（步骤 3） */
    @PostMapping("/api/projects/{projectId}/papers")
    public ApiResponse<PaperUploadResponse> createPaper(
            @PathVariable Long projectId,
            @Valid @RequestBody PaperCreateRequest req) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(paperService.createPaper(userId, projectId, req));
    }

    // 2026-08-15 myf: 文献一键导入（检索入库/DOI 导入）：Crossref 补全元数据，
    // 有 PDF 直链触发 AI 分析，否则仅元数据入库（状态 UPLOADED）
    /** 文献导入：DOI/标题 + 可选 PDF 直链入库 */
    @PostMapping("/api/projects/{projectId}/papers/import")
    public ApiResponse<Paper> importPaper(
            @PathVariable Long projectId,
            @Valid @RequestBody PaperImportRequest req) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(paperService.importPaper(userId, projectId, req));
    }

    /** 论文详情 */
    @GetMapping("/api/papers/{id}")
    public ApiResponse<Paper> getPaper(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(paperService.requirePaperOwnedBy(id, userId));
    }

    /** 论文状态轮询 */
    @GetMapping("/api/papers/{id}/status")
    public ApiResponse<String> getStatus(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        Paper paper = paperService.requirePaperOwnedBy(id, userId);
        return ApiResponse.ok(paper.getStatus());
    }

    /** Paper Intelligence Card */
    @GetMapping("/api/papers/{id}/card")
    public ApiResponse<Map<String, Object>> getCard(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        Paper paper = paperService.requirePaperOwnedBy(id, userId);
        return ApiResponse.ok(paper.getSummary());
    }

    /** 项目下论文列表，支持按文件夹筛选 */
    @GetMapping("/api/projects/{projectId}/papers")
    public ApiResponse<PageResponse<PaperListItem>> listPapers(
            @PathVariable Long projectId,
            @RequestParam(required = false) Long folderId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(paperService.listByProject(projectId, userId, folderId, page, size));
    }

    /** 移动论文到文件夹 */
    @PutMapping("/api/papers/{paperId}/move")
    public ApiResponse<Void> movePaper(
            @PathVariable Long paperId,
            @RequestBody Map<String, Long> body) {
        Long userId = currentUserResolver.requireUserId();
        Long folderId = body.get("folderId");
        paperService.movePaper(userId, paperId, folderId);
        return ApiResponse.ok();
    }

    /** 删除论文（含向量清理：发 MQ 通知 ai-service 删 paper_chunk） */
    @DeleteMapping("/api/papers/{id}")
    public ApiResponse<Void> deletePaper(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        paperService.deletePaper(userId, id);
        return ApiResponse.ok();
    }
}
