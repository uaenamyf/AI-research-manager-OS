package com.researchos.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.researchos.common.response.PageResponse;
import com.researchos.dto.ProjectCreateRequest;
import com.researchos.entity.ResearchProject;

/**
 * 项目服务：CRUD，所有查询带 userId 过滤。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface ProjectService extends IService<ResearchProject> {

    /**
     * 创建项目。
     */
    ResearchProject create(Long userId, ProjectCreateRequest req);

    /**
     * 项目列表（带分页）。
     */
    PageResponse<ResearchProject> list(Long userId, int page, int size);

    /**
     * 获取项目详情，校验归属。
     */
    ResearchProject requireProjectOwnedBy(Long projectId, Long userId);
}
