package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.entity.Folder;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.FolderService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 文件夹管理控制器。
 *
 * @author myf
 * @since 2026-07-23
 */
@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class FolderController {

    private final FolderService folderService;
    private final CurrentUserResolver currentUserResolver;

    /**
     * 创建文件夹。
     */
    @PostMapping("/folders")
    public ApiResponse<Folder> createFolder(
            @Valid @RequestBody CreateFolderRequest req) {

        Long userId = currentUserResolver.requireUserId();
        Folder folder = folderService.createFolder(userId, req.getProjectId(), req.getParentId(), req.getName());
        return ApiResponse.ok(folder);
    }

    /**
     * 获取项目文件夹树。
     */
    @GetMapping("/projects/{projectId}/folders/tree")
    public ApiResponse<List<Folder>> getFolderTree(
            @PathVariable Long projectId) {

        Long userId = currentUserResolver.requireUserId();
        List<Folder> tree = folderService.getFolderTree(userId, projectId);
        return ApiResponse.ok(tree);
    }

    /**
     * 获取子文件夹列表。
     */
    @GetMapping("/projects/{projectId}/folders")
    public ApiResponse<List<Folder>> getChildFolders(
            @PathVariable Long projectId,
            @RequestParam(required = false) Long parentId) {

        Long userId = currentUserResolver.requireUserId();
        List<Folder> folders;
        if (parentId == null) {
            folders = folderService.getRootFolders(userId, projectId);
        } else {
            folders = folderService.getChildFolders(userId, projectId, parentId);
        }
        return ApiResponse.ok(folders);
    }

    /**
     * 重命名文件夹。
     */
    @PutMapping("/folders/{folderId}/rename")
    public ApiResponse<Folder> renameFolder(
            @PathVariable Long folderId,
            @RequestBody Map<String, String> body) {

        Long userId = currentUserResolver.requireUserId();
        String newName = body.get("name");
        Folder folder = folderService.renameFolder(userId, folderId, newName);
        return ApiResponse.ok(folder);
    }

    /**
     * 移动文件夹。
     */
    @PutMapping("/folders/{folderId}/move")
    public ApiResponse<Folder> moveFolder(
            @PathVariable Long folderId,
            @RequestBody Map<String, Long> body) {

        Long userId = currentUserResolver.requireUserId();
        Long newParentId = body.get("parentId");
        Folder folder = folderService.moveFolder(userId, folderId, newParentId);
        return ApiResponse.ok(folder);
    }

    /**
     * 删除文件夹。
     */
    @DeleteMapping("/folders/{folderId}")
    public ApiResponse<Void> deleteFolder(
            @PathVariable Long folderId) {

        Long userId = currentUserResolver.requireUserId();
        folderService.deleteFolder(userId, folderId);
        return ApiResponse.ok();
    }

    /**
     * 更新排序。
     */
    @PutMapping("/folders/{folderId}/sort")
    public ApiResponse<Void> updateSortOrder(
            @PathVariable Long folderId,
            @RequestBody Map<String, Integer> body) {

        Long userId = currentUserResolver.requireUserId();
        Integer sortOrder = body.get("sortOrder");
        folderService.updateSortOrder(userId, folderId, sortOrder);
        return ApiResponse.ok();
    }

    /**
     * 创建文件夹请求 DTO。
     */
    @lombok.Data
    public static class CreateFolderRequest {
        @NotNull private Long projectId;
        private Long parentId;
        @NotBlank private String name;
    }
}
