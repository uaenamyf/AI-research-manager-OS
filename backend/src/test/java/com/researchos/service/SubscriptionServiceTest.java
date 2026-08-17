package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.config.AppProperties;
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

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
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

    @Mock
    private AppProperties appProperties;

    @InjectMocks
    private SubscriptionServiceImpl subscriptionService;

    private static final Long TEST_USER_ID = 1L;

    @BeforeEach
    void setUp() {
        // 开启额度校验开关（生产默认关闭），让本测试覆盖真实拦截逻辑
        AppProperties.Subscription subscription = new AppProperties.Subscription();
        subscription.setEnforceQuota(true);
        lenient().when(appProperties.getSubscription()).thenReturn(subscription);
    }

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

    @Test
    void testCheckQuota_EnforcementDisabled_NoLimit() {
        // 开关关闭（开发阶段默认）时，即使超额也不拦截（提前返回，不查库）
        AppProperties.Subscription off = new AppProperties.Subscription(); // 默认 enforceQuota=false
        when(appProperties.getSubscription()).thenReturn(off);

        assertDoesNotThrow(() ->
                subscriptionService.checkQuota(TEST_USER_ID, "FREE")
        );
    }
}
