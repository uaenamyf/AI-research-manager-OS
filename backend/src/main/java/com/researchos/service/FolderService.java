package com.researchos.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.researchos.entity.Folder;

import java.util.List;

/**
 * 文件夹服务接口。
 *
 * @author myf
 * @since 2026-07-23
 */
public interface FolderService extends IService<Folder> {

    /**
     * 创建文件夹。
     */
    Folder createFolder(Long userId, Long projectId, Long parentId, String name);

    /**
     * 获取项目根目录下的文件夹列表。
     */
    List<Folder> getRootFolders(Long userId, Long projectId);

    /**
     * 获取子文件夹列表。
     */
    List<Folder> getChildFolders(Long userId, Long projectId, Long parentId);

    /**
     * 获取完整文件夹树。
     */
    List<Folder> getFolderTree(Long userId, Long projectId);

    /**
     * 重命名文件夹。
     */
    Folder renameFolder(Long userId, Long folderId, String newName);

    /**
     * 移动文件夹。
     */
    Folder moveFolder(Long userId, Long folderId, Long newParentId);

    /**
     * 删除文件夹。
     */
    void deleteFolder(Long userId, Long folderId);

    /**
     * 更新排序。
     */
    void updateSortOrder(Long userId, Long folderId, Integer sortOrder);

    /**
     * 检查文件夹所有权。
     */
    Folder checkOwnership(Long userId, Long folderId);
}
