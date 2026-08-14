package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 订阅 Checkout 响应：返回 Stripe Checkout 页面地址，前端 302 跳转。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@AllArgsConstructor
public class CheckoutResponse {

    /** Stripe Checkout Session 的支付页面地址。 */
    private String checkoutUrl;

    /** Stripe 会话 id（测试/调试用）。 */
    private String sessionId;
}
