package com.researchos.service;

import com.researchos.dto.CheckoutResponse;
import com.researchos.entity.User;

/**
 * 订阅服务：额度校验 + Stripe 订阅（Checkout / Webhook 升级）。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface SubscriptionService {

    /**
     * 校验上传额度。
     */
    void checkQuota(Long userId, String plan);

    /**
     * 创建 Stripe Checkout 会话（订阅升级）。
     *
     * @return Checkout 支付页面地址；Stripe 未配置时抛业务异常
     */
    CheckoutResponse createCheckout(User user, String targetPlan);

    /**
     * 处理 Stripe Webhook 事件（checkout.session.completed 等），返回是否已消费。
     */
    boolean handleWebhookEvent(String payload, String signatureHeader);
}
