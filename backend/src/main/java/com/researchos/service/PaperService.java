package com.researchos.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.researchos.common.response.PageResponse;
import com.researchos.dto.PaperCreateRequest;
import com.researchos.dto.PaperImportRequest;
import com.researchos.dto.PaperListItem;
import com.researchos.dto.PaperUploadResponse;
import com.researchos.entity.Paper;

import java.util.Map;

/**
 * 论文服务：上传、查询、状态管理。
 * 所有查询带 userId 过滤（多租户隔离）。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface PaperService extends IService<Paper> {

    /**
     * 创建论文记录 + 发 MQ 触发 AI 分析。
     */
    PaperUploadResponse createPaper(Long userId, Long projectId, PaperCreateRequest req);

    /**
     * 文献导入（检索一键入库 / DOI 导入）：Crossref 补全元数据，
     * 有 PDF 直链则发 MQ 触发分析，否则仅元数据入库。
     */
    Paper importPaper(Long userId, Long projectId, PaperImportRequest req);

    /**
     * 论文详情，校验归属。
     */
    Paper requirePaperOwnedBy(Long paperId, Long userId);

    /**
     * 项目下论文列表，支持按文件夹筛选。
     */
    PageResponse<PaperListItem> listByProject(Long projectId, Long userId, Long folderId, int page, int size);

    /**
     * 移动论文到文件夹。
     */
    void movePaper(Long userId, Long paperId, Long folderId);

    /**
     * 删除论文（校验归属 + 删 MySQL 记录 + 发 paper.delete MQ 清理 PG 向量）。
     */
    void deletePaper(Long userId, Long paperId);

    /**
     * 更新分析结果（ai-service 回调调用）。
     */
    void updateAnalysisResult(Long paperId, Map<String, Object> summary, String status);
}
