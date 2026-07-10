package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.common.response.PageResponse;
import com.researchos.config.RabbitConfig;
import com.researchos.dto.AiTaskMessage;
import com.researchos.dto.PaperCreateRequest;
import com.researchos.dto.PaperListItem;
import com.researchos.dto.PaperUploadResponse;
import com.researchos.entity.Paper;
import com.researchos.entity.User;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.PaperService;
import com.researchos.service.ProjectService;
import com.researchos.service.SubscriptionService;
import com.researchos.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
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
        paper.setTitle(req.getFileName()); // 初始用文件名，AI 分析后更新
        paper.setPdfUrl(req.getS3Key());
        paper.setStatus("PROCESSING");
        paper.setCreatedTime(OffsetDateTime.now());
        save(paper);

        // 发 MQ 触发 ai-service 分析
        rabbitTemplate.convertAndSend(
                RabbitConfig.EXCHANGE_AI_TASK,
                RabbitConfig.ROUTING_PAPER_ANALYZE,
                new AiTaskMessage(paper.getId(), "PAPER_ANALYSIS",
                        Map.of("paperId", paper.getId(), "pdfUrl", req.getS3Key())));

        return new PaperUploadResponse(paper.getId(), paper.getStatus());
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
     * 项目下论文列表。
     */
    @Override
    public PageResponse<PaperListItem> listByProject(Long projectId, Long userId,
                                                       int page, int size) {
        projectService.requireProjectOwnedBy(projectId, userId);
        Page<Paper> p = page(
                new Page<>(page, size),
                new LambdaQueryWrapper<Paper>()
                        .eq(Paper::getProjectId, projectId)
                        .eq(Paper::getUserId, userId)
                        .orderByDesc(Paper::getCreatedTime));
        var items = p.getRecords().stream().map(this::toListItem).toList();
        return PageResponse.of(items, p.getTotal(), page, size);
    }

    /**
     * 更新分析结果（ai-service 回调调用）。
     */
    @Override
    @Transactional
    public void updateAnalysisResult(Long paperId, Map<String, Object> summary,
                                     String status) {
        Paper paper = getById(paperId);
        if (paper == null) {
            throw new BusinessException(ErrorCode.PAPER_NOT_FOUND);
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
        dto.setCreatedTime(paper.getCreatedTime());
        return dto;
    }
}
