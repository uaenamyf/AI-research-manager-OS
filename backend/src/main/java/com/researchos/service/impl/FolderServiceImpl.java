package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.entity.Folder;
import com.researchos.mapper.FolderMapper;
import com.researchos.service.FolderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 文件夹服务实现。
 *
 * @author myf
 * @since 2026-07-23
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FolderServiceImpl extends ServiceImpl<FolderMapper, Folder> implements FolderService {

    @Override
    @Transactional
    public Folder createFolder(Long userId, Long projectId, Long parentId, String name) {
        // 检查父文件夹存在且归属正确
        if (parentId != null) {
            checkOwnership(userId, parentId);
        }

        Folder folder = new Folder();
        folder.setUserId(userId);
        folder.setProjectId(projectId);
        folder.setParentId(parentId);
        folder.setName(name);
        folder.setSortOrder(0);
        folder.setCreatedAt(OffsetDateTime.now());
        folder.setUpdatedAt(OffsetDateTime.now());

        try {
            save(folder);
        } catch (DuplicateKeyException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST.getCode(), "同目录下文件夹名重复");
        }

        return folder;
    }

    @Override
    public List<Folder> getRootFolders(Long userId, Long projectId) {
        return list(new LambdaQueryWrapper<Folder>()
                .eq(Folder::getUserId, userId)
                .eq(Folder::getProjectId, projectId)
                .isNull(Folder::getParentId)
                .orderByDesc(Folder::getSortOrder)
                .orderByAsc(Folder::getName));
    }

    @Override
    public List<Folder> getChildFolders(Long userId, Long projectId, Long parentId) {
        return list(new LambdaQueryWrapper<Folder>()
                .eq(Folder::getUserId, userId)
                .eq(Folder::getProjectId, projectId)
                .eq(Folder::getParentId, parentId)
                .orderByDesc(Folder::getSortOrder)
                .orderByAsc(Folder::getName));
    }

    @Override
    public List<Folder> getFolderTree(Long userId, Long projectId) {
        List<Folder> all = list(new LambdaQueryWrapper<Folder>()
                .eq(Folder::getUserId, userId)
                .eq(Folder::getProjectId, projectId));

        // 构建树结构
        Map<Long, List<Folder>> childrenMap = all.stream()
                .filter(f -> f.getParentId() != null)
                .collect(Collectors.groupingBy(Folder::getParentId));

        List<Folder> roots = all.stream()
                .filter(f -> f.getParentId() == null)
                .sorted((a, b) -> {
                    int sort = b.getSortOrder().compareTo(a.getSortOrder());
                    return sort != 0 ? sort : a.getName().compareTo(b.getName());
                })
                .collect(Collectors.toList());

        // 递归填充子节点
        roots.forEach(root -> fillChildren(root, childrenMap));
        return roots;
    }

    private void fillChildren(Folder parent, Map<Long, List<Folder>> childrenMap) {
        List<Folder> children = childrenMap.get(parent.getId());
        if (children == null) {
            parent.setChildren(Collections.emptyList());
            return;
        }
        children.sort((a, b) -> {
            int sort = b.getSortOrder().compareTo(a.getSortOrder());
            return sort != 0 ? sort : a.getName().compareTo(b.getName());
        });
        parent.setChildren(children);
        children.forEach(child -> fillChildren(child, childrenMap));
    }

    @Override
    @Transactional
    public Folder renameFolder(Long userId, Long folderId, String newName) {
        Folder folder = checkOwnership(userId, folderId);
        folder.setName(newName);
        folder.setUpdatedAt(OffsetDateTime.now());
        updateById(folder);
        return folder;
    }

    @Override
    @Transactional
    public Folder moveFolder(Long userId, Long folderId, Long newParentId) {
        Folder folder = checkOwnership(userId, folderId);

        // 检查目标父文件夹
        if (newParentId != null) {
            Folder newParent = checkOwnership(userId, newParentId);
            if (!newParent.getProjectId().equals(folder.getProjectId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST.getCode(), "不能跨项目移动文件夹");
            }

            // 检查循环引用
            if (folderId.equals(newParentId)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST.getCode(), "不能将文件夹移动到自身");
            }

            // 检查是否将父文件夹移动到子文件夹中
            if (isDescendant(folderId, newParentId)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST.getCode(), "循环引用");
            }
        }

        folder.setParentId(newParentId);
        folder.setUpdatedAt(OffsetDateTime.now());
        updateById(folder);
        return folder;
    }

    @Override
    @Transactional
    public void deleteFolder(Long userId, Long folderId) {
        checkOwnership(userId, folderId);
        // 级联删除由 ON DELETE CASCADE / SET NULL 处理
        // folder_id SET NULL，paper 不会被删
        removeById(folderId);
    }

    @Override
    @Transactional
    public void updateSortOrder(Long userId, Long folderId, Integer sortOrder) {
        Folder folder = checkOwnership(userId, folderId);
        folder.setSortOrder(sortOrder);
        folder.setUpdatedAt(OffsetDateTime.now());
        updateById(folder);
    }

    @Override
    public Folder checkOwnership(Long userId, Long folderId) {
        Folder folder = getById(folderId);
        if (folder == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        if (!folder.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return folder;
    }

    private boolean isDescendant(Long ancestorId, Long folderId) {
        Folder folder = getById(folderId);
        while (folder != null && folder.getParentId() != null) {
            if (folder.getParentId().equals(ancestorId)) {
                return true;
            }
            folder = getById(folder.getParentId());
        }
        return false;
    }
}
