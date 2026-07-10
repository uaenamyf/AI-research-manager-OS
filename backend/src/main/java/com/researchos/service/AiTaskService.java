package com.researchos.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.researchos.dto.ReviewGenerateRequest;
import com.researchos.entity.AiTask;

import java.util.Map;

/**
 * AI 任务服务：创建任务、发 MQ、回调更新。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface AiTaskService extends IService<AiTask> {

    /**
     * 创建综述任务 + 发 MQ。
     */
    Long createReviewTask(Long userId, ReviewGenerateRequest req);

    /**
     * 获取任务（校验归属）。
     */
    AiTask requireTaskOwnedBy(Long taskId, Long userId);

    /**
     * 回调：更新任务结果。
     */
    void updateTaskResult(Long taskId, Map<String, Object> result, String status, String error);
}
