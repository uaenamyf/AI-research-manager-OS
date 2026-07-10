package com.researchos.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.RabbitConfig;
import com.researchos.dto.AiTaskMessage;
import com.researchos.dto.ReviewGenerateRequest;
import com.researchos.entity.AiTask;
import com.researchos.mapper.AiTaskMapper;
import com.researchos.service.AiTaskService;
import com.researchos.service.PaperService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * AI 任务服务实现：创建任务、发 MQ、回调更新。
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiTaskServiceImpl extends ServiceImpl<AiTaskMapper, AiTask> implements AiTaskService {

    private final RabbitTemplate rabbitTemplate;
    private final PaperService paperService;

    /**
     * 创建综述任务 + 发 MQ。
     */
    @Override
    @Transactional
    public Long createReviewTask(Long userId, ReviewGenerateRequest req) {
        // 校验论文归属
        for (Long paperId : req.getPaperIds()) {
            paperService.requirePaperOwnedBy(paperId, userId);
        }

        AiTask task = new AiTask();
        task.setUserId(userId);
        task.setType("REVIEW_GENERATION");
        task.setStatus("PENDING");
        task.setCreatedTime(OffsetDateTime.now());
        save(task);

        rabbitTemplate.convertAndSend(
                RabbitConfig.EXCHANGE_AI_TASK,
                RabbitConfig.ROUTING_REVIEW_GENERATE,
                new AiTaskMessage(task.getTaskId(), "REVIEW_GENERATION",
                        Map.of("paperIds", req.getPaperIds(), "topic", req.getTopic())));

        return task.getTaskId();
    }

    /**
     * 获取任务（校验归属）。
     */
    @Override
    public AiTask requireTaskOwnedBy(Long taskId, Long userId) {
        AiTask task = getById(taskId);
        if (task == null || !task.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }
        return task;
    }

    /**
     * 回调：更新任务结果。
     */
    @Override
    @Transactional
    public void updateTaskResult(Long taskId, Map<String, Object> result,
                                 String status, String error) {
        AiTask task = getById(taskId);
        if (task == null) {
            log.warn("回调任务不存在: {}", taskId);
            return;
        }
        task.setResult(result);
        task.setStatus(status);
        task.setError(error);
        updateById(task);
    }

    /**
     * 监听 DLQ：任务失败。
     */
    @org.springframework.amqp.rabbit.annotation.RabbitListener(queues = RabbitConfig.QUEUE_DLQ)
    public void handleDlq(AiTaskMessage msg) {
        log.error("任务进入 DLQ: {}", msg);
        updateTaskResult(msg.getTaskId(), null, "FAILED", "消费失败超过重试次数");
    }
}
