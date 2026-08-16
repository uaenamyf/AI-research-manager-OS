package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.common.response.PageResponse;
import com.researchos.config.RabbitConfig;
import com.researchos.dto.AiTaskMessage;
import com.researchos.dto.PaperCreateRequest;
import com.researchos.dto.PaperImportRequest;
import com.researchos.dto.PaperListItem;
import com.researchos.dto.PaperUploadResponse;
import com.researchos.entity.Paper;
import com.researchos.entity.User;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.PaperService;
import com.researchos.service.ProjectService;
import com.researchos.service.SubscriptionService;
import com.researchos.service.UserService;
import com.researchos.service.support.CrossrefService;
import com.researchos.service.support.CrossrefService.CrossrefMeta;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 论文服务实现：上传、查询、状态管理。
 * 所有查询带 userId 过滤（多租户隔离）。
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaperServiceImpl extends ServiceImpl<PaperMapper, Paper> implements PaperService {

    private final ProjectService projectService;
    private final RabbitTemplate rabbitTemplate;
    private final SubscriptionService subscriptionService;
    private final UserService userService;
    private final CrossrefService crossrefService;

    /**
     * 创建论文记录 + 发 MQ 触发 AI 分析。
     */
    @Override
    @Transactional
    public PaperUploadResponse createPaper(Long userId, Long projectId,
                                            PaperCreateRequest req) {
        // 校验项目归属
        projectService.requireProjectOwnedBy(projectId, userId);
        // 校验上传额度
        User user = userService.requireUser(userId);
        subscriptionService.checkQuota(userId, user.getPlan());

        Paper paper = new Paper();
        paper.setProjectId(projectId);
        paper.setUserId(userId);
        paper.setFolderId(req.getFolderId());
        paper.setTitle(req.getFileName()); // 初始用文件名，AI 分析后更新
        paper.setPdfUrl(req.getS3Key());
        paper.setStatus("PROCESSING");
        paper.setCreatedTime(LocalDateTime.now());
        save(paper);

        // 发 MQ 触发 ai-service 分析
        rabbitTemplate.convertAndSend(
                RabbitConfig.EXCHANGE_AI_TASK,
                RabbitConfig.ROUTING_PAPER_ANALYZE,
                new AiTaskMessage(paper.getId(), "PAPER_ANALYSIS",
                        Map.of("paperId", paper.getId(), "pdfUrl", req.getS3Key())));

        return new PaperUploadResponse(paper.getId(), paper.getStatus());
    }

    // 2026-08-15 myf: 文献一键导入：DOI 存在时经 Crossref 补全权威元数据；
    // 有 PDF 直链则发 MQ 触发分析，否则仅元数据入库（状态 UPLOADED）
    @Override
    @Transactional
    public Paper importPaper(Long userId, Long projectId, PaperImportRequest req) {
        // 校验项目归属
        projectService.requireProjectOwnedBy(projectId, userId);
        // 校验导入额度
        User user = userService.requireUser(userId);
        subscriptionService.checkQuota(userId, user.getPlan());

        // DOI 存在时用 Crossref 补全权威元数据（失败优雅降级到请求参数）
        CrossrefMeta meta = null;
        String doi = req.getDoi() == null ? "" : req.getDoi().trim();
        if (!doi.isBlank()) {
            meta = crossrefService.resolve(doi).orElse(null);
        }

        String title = firstNonBlank(meta != null ? meta.title() : null, req.getTitle());
        if (title == null || title.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST);
        }
        String authors = firstNonBlank(meta != null ? meta.authors() : null, joinAuthors(req.getAuthors()));
        Integer year = meta != null && meta.year() != null ? meta.year() : req.getYear();
        String pdfUrl = req.getPdfUrl() == null ? "" : req.getPdfUrl().trim();

        Paper paper = new Paper();
        paper.setProjectId(projectId);
        paper.setUserId(userId);
        paper.setFolderId(req.getFolderId());
        paper.setTitle(title.trim());
        paper.setAuthors(authors);
        paper.setYear(year);
        paper.setDoi(doi.isBlank() ? null : doi);
        paper.setPdfUrl(pdfUrl);
        // 有 PDF 直链 → PROCESSING 触发分析；纯元数据 → UPLOADED（等后续补 PDF）
        paper.setStatus(pdfUrl.isBlank() ? "UPLOADED" : "PROCESSING");
        paper.setCreatedTime(LocalDateTime.now());
        save(paper);

        if (!pdfUrl.isBlank()) {
            rabbitTemplate.convertAndSend(
                    RabbitConfig.EXCHANGE_AI_TASK,
                    RabbitConfig.ROUTING_PAPER_ANALYZE,
                    new AiTaskMessage(paper.getId(), "PAPER_ANALYSIS",
                            Map.of("paperId", paper.getId(), "pdfUrl", pdfUrl)));
        }
        log.info("导入论文：paperId={}, title={}, hasPdf={}", paper.getId(), title, !pdfUrl.isBlank());
        return paper;
    }

    /**
     * 论文详情，校验归属。
     */
    @Override
    public Paper requirePaperOwnedBy(Long paperId, Long userId) {
        Paper paper = getOne(new LambdaQueryWrapper<Paper>()
                .eq(Paper::getId, paperId)
                .eq(Paper::getUserId, userId));
        if (paper == null) {
            throw new BusinessException(ErrorCode.PAPER_NOT_FOUND);
        }
        return paper;
    }

    /**
     * 项目下论文列表，支持按文件夹筛选。
     */
    @Override
    public PageResponse<PaperListItem> listByProject(Long projectId, Long userId, Long folderId,
                                                       int page, int size) {
        projectService.requireProjectOwnedBy(projectId, userId);

        LambdaQueryWrapper<Paper> wrapper = new LambdaQueryWrapper<Paper>()
                .eq(Paper::getProjectId, projectId)
                .eq(Paper::getUserId, userId)
                .orderByDesc(Paper::getCreatedTime);

        // folderId = null 表示根目录（未归档的论文）；folderId = -1 表示全部文件夹
        if (folderId == null) {
            wrapper.isNull(Paper::getFolderId);
        } else if (folderId == -1L) {
            // 全部文件夹：不过滤
        } else {
            wrapper.eq(Paper::getFolderId, folderId);
        }

        Page<Paper> p = page(new Page<>(page, size), wrapper);
        var items = p.getRecords().stream().map(this::toListItem).toList();
        return PageResponse.of(items, p.getTotal(), page, size);
    }

    /**
     * 移动论文到文件夹。
     * folderId 为 null 表示移到根目录；updateById 默认 NOT_NULL 策略会忽略 null 字段，
     * 因此必须用 update wrapper 显式 set，否则「拖回根目录」不生效。
     */
    @Override
    @Transactional
    public void movePaper(Long userId, Long paperId, Long folderId) {
        requirePaperOwnedBy(paperId, userId);
        LambdaUpdateWrapper<Paper> wrapper = new LambdaUpdateWrapper<Paper>()
                .eq(Paper::getId, paperId)
                .eq(Paper::getUserId, userId)
                .set(Paper::getFolderId, folderId);
        update(wrapper);
    }

    /**
     * 删除论文：校验归属 -> 删除 MySQL 记录 -> 发 paper.delete MQ。
     *
     * <p>paper_chunk 在 PG 向量库（跨库无物理外键），删除后通过 MQ
     * 通知 ai-service 清理对应 chunk，实现跨库最终一致（见 AGENTS.md §6.3）。
     */
    @Override
    @Transactional
    public void deletePaper(Long userId, Long paperId) {
        requirePaperOwnedBy(paperId, userId);
        removeById(paperId);
        // 发 MQ 让 ai-service 清理 PG paper_chunk（幂等：chunk 不存在也安全）
        rabbitTemplate.convertAndSend(
                RabbitConfig.EXCHANGE_AI_TASK,
                RabbitConfig.ROUTING_PAPER_DELETE,
                new AiTaskMessage(paperId, "PAPER_DELETE",
                        Map.of("paperId", paperId)));
        log.info("已删除论文 paperId={} 并发 paper.delete 消息清理向量", paperId);
    }

    /**
     * 更新分析结果（ai-service 回调调用）。
     * 同时将 summary 中的 authors/year 同步到 paper 实体字段，用于引用渲染。
     */
    @Override
    @Transactional
    public void updateAnalysisResult(Long paperId, Map<String, Object> summary,
                                     String status) {
        Paper paper = getById(paperId);
        if (paper == null) {
            throw new BusinessException(ErrorCode.PAPER_NOT_FOUND);
        }
        // 从 summary 中提取 authors/year 同步到实体字段（供引用服务使用）
        if (summary != null) {
            Object authorsObj = summary.get("authors");
            if (authorsObj instanceof String authorStr && !authorStr.isBlank()) {
                paper.setAuthors(authorStr);
            }
            Object yearObj = summary.get("year");
            if (yearObj instanceof Number yearNum) {
                paper.setYear(yearNum.intValue());
            }
            Object titleObj = summary.get("title");
            if (titleObj instanceof String titleStr && !titleStr.isBlank()) {
                // 仅当原标题是文件名时覆盖；否则保留原标题
                if (paper.getTitle() == null || paper.getTitle().isBlank() || paper.getTitle().endsWith(".pdf")) {
                    paper.setTitle(titleStr);
                }
            }
        }
        paper.setSummary(summary);
        paper.setStatus(status);
        updateById(paper);
    }

    private PaperListItem toListItem(Paper paper) {
        PaperListItem dto = new PaperListItem();
        dto.setId(paper.getId());
        dto.setTitle(paper.getTitle());
        dto.setAuthors(paper.getAuthors());
        dto.setYear(paper.getYear());
        dto.setStatus(paper.getStatus());
        dto.setFolderId(paper.getFolderId());
        dto.setCreatedTime(paper.getCreatedTime());
        return dto;
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    private String joinAuthors(java.util.List<String> authors) {
        if (authors == null || authors.isEmpty()) {
            return null;
        }
        return String.join(", ", authors);
    }
}
