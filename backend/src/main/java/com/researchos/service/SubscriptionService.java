package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.entity.Paper;
import com.researchos.mapper.PaperMapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;

/**
 * 订阅服务：额度校验（MVP 版，按月计数）。
 * 生产环境对接 Stripe。
 *
 * @author myf
 * @since 2026-07-08
 */
@Service
@RequiredArgsConstructor
public class SubscriptionService {

    private static final Map<String, Integer> PLAN_LIMITS = Map.of(
            "FREE", 10,
            "PRO", 500,
            "RESEARCHER", Integer.MAX_VALUE
    );

    private final PaperMapper paperMapper;

    /**
     * 校验上传额度。
     */
    public void checkQuota(Long userId, String plan) {
        int limit = PLAN_LIMITS.getOrDefault(plan, 10);
        if (limit == Integer.MAX_VALUE) return;

        // 本月上传数
        OffsetDateTime monthStart = OffsetDateTime.now()
                .withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0);
        Long count = paperMapper.selectCount(
                new LambdaQueryWrapper<Paper>()
                        .eq(Paper::getUserId, userId)
                        .ge(Paper::getCreatedTime, monthStart));
        if (count >= limit) {
            throw new BusinessException(ErrorCode.QUOTA_EXCEEDED);
        }
    }
}
