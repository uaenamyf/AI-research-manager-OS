package com.researchos.service;

/**
 * 订阅服务：额度校验（MVP 版，按月计数）。
 * 生产环境对接 Stripe。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface SubscriptionService {

    /**
     * 校验上传额度。
     */
    void checkQuota(Long userId, String plan);
}
