package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.common.response.PageResponse;
import com.researchos.dto.ProjectCreateRequest;
import com.researchos.entity.ResearchProject;
import com.researchos.mapper.ProjectMapper;
import com.researchos.service.ProjectService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

/**
 * 项目服务实现：CRUD，所有查询带 userId 过滤。
 *
 * @author myf
 * @since 2026-07-08
 */
@Service
public class ProjectServiceImpl extends ServiceImpl<ProjectMapper, ResearchProject> implements ProjectService {

    @Override
    @Transactional
    public ResearchProject create(Long userId, ProjectCreateRequest req) {
        ResearchProject project = new ResearchProject();
        project.setUserId(userId);
        project.setName(req.getName());
        project.setDescription(req.getDescription());
        project.setDomain(req.getDomain());
        project.setCreatedTime(OffsetDateTime.now());
        save(project);
        return project;
    }

    @Override
    public PageResponse<ResearchProject> list(Long userId, int page, int size) {
        Page<ResearchProject> p = page(
                new Page<>(page, size),
                new LambdaQueryWrapper<ResearchProject>()
                        .eq(ResearchProject::getUserId, userId)
                        .orderByDesc(ResearchProject::getCreatedTime));
        return PageResponse.of(p.getRecords(), p.getTotal(), page, size);
    }

    /**
     * 获取项目详情，校验归属。
     */
    @Override
    public ResearchProject requireProjectOwnedBy(Long projectId, Long userId) {
        ResearchProject project = getOne(new LambdaQueryWrapper<ResearchProject>()
                .eq(ResearchProject::getId, projectId)
                .eq(ResearchProject::getUserId, userId));
        if (project == null) {
            throw new BusinessException(ErrorCode.PROJECT_NOT_FOUND);
        }
        return project;
    }
}
