package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.entity.Paper;
import com.researchos.entity.User;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.impl.SubscriptionServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 订阅服务单元测试：额度校验逻辑。
 *
 * @author myf
 * @since 2026-07-21
 */
@ExtendWith(MockitoExtension.class)
class SubscriptionServiceTest {

    @Mock
    private PaperMapper paperMapper;

    @InjectMocks
    private SubscriptionServiceImpl subscriptionService;

    private static final Long TEST_USER_ID = 1L;

    @Test
    void testCheckQuota_WithinLimit() {
        // 模拟：本月已上传 5 篇（< 10 限制）
        when(paperMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(5L);

        // 不抛出异常即为通过
        assertDoesNotThrow(() ->
                subscriptionService.checkQuota(TEST_USER_ID, "FREE")
        );
    }

    @Test
    void testCheckQuota_AtLimitBoundary() {
        // 模拟：刚好上传 10 篇（等于限制，应该允许上传第 10 篇后触发？
        // 注意：当前逻辑是 >= limit 时拦截，所以 10 篇时会拦截第 11 篇
        when(paperMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(9L);

        // 9 篇时应该允许上传第 10 篇
        assertDoesNotThrow(() ->
                subscriptionService.checkQuota(TEST_USER_ID, "FREE")
        );
    }

    @Test
    void testCheckQuota_ExceedLimit_ShouldThrow() {
        // 模拟：已上传 10 篇，达到限制
        when(paperMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(10L);

        // 应该抛出异常
        assertThrows(RuntimeException.class, () ->
                subscriptionService.checkQuota(TEST_USER_ID, "FREE")
        );
    }

    @Test
    void testCheckQuota_ProPlan_HigherLimit() {
        // PRO 计划限制 500，50 篇应该没问题
        when(paperMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(50L);

        assertDoesNotThrow(() ->
                subscriptionService.checkQuota(TEST_USER_ID, "PRO")
        );
    }

    @Test
    void testCheckQuota_ResearcherPlan_NoLimit() {
        // RESEARCHER 计划无限制，checkQuota 直接返回不查库
        assertDoesNotThrow(() ->
                subscriptionService.checkQuota(TEST_USER_ID, "RESEARCHER")
        );
    }
}
