package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.dto.CheckoutRequest;
import com.researchos.dto.CheckoutResponse;
import com.researchos.entity.User;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.SubscriptionService;
import com.researchos.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 订阅控制器：Stripe Checkout 会话创建 + Webhook 回调。
 *
 * @author myf
 * @since 2026-07-08
 */
@RestController
@RequestMapping("/api/subscription")
@RequiredArgsConstructor
public class SubscriptionController {

    private final SubscriptionService subscriptionService;
    private final UserService userService;
    private final CurrentUserResolver currentUserResolver;

    /** 公开可查的套餐信息（前端设置页展示）。 */
    private static final List<Map<String, Object>> PLANS = List.of(
            Map.of("id", "FREE", "label", "Free", "limit", 10,
                    "desc", "10 papers / month"),
            Map.of("id", "PRO", "label", "Pro", "limit", 500,
                    "desc", "500 papers · Unlimited AI chat · Review generation"),
            Map.of("id", "RESEARCHER", "label", "Researcher", "limit", -1,
                    "desc", "Unlimited · Advanced writing")
    );

    /**
     * 创建 Checkout 会话：返回支付页面地址，前端 302 跳转 Stripe。
     */
    @PostMapping("/checkout")
    public ApiResponse<CheckoutResponse> checkout(
            @Valid @RequestBody CheckoutRequest req) {
        Long userId = currentUserResolver.requireUserId();
        User user = userService.requireUser(userId);
        return ApiResponse.ok(subscriptionService.createCheckout(user, req.getPlan()));
    }

    /**
     * Stripe Webhook 回调（无 JWT，靠签名头校验）。
     * 返回 200 表示已消费事件；非 2xx 会让 Stripe 重试。
     */
    @PostMapping("/webhook")
    public ResponseEntity<String> webhook(
            @RequestBody String payload,
            @RequestHeader("Stripe-Signature") String sigHeader) {
        boolean consumed = subscriptionService.handleWebhookEvent(payload, sigHeader);
        if (!consumed) {
            // 未识别的事件类型：按 Stripe 约定返回 200（否则重试无意义）
            return ResponseEntity.ok("ignored");
        }
        return ResponseEntity.ok("ok");
    }

    /**
     * 套餐列表（前端设置页展示，登录即可查）。
     */
    @GetMapping("/plans")
    public ApiResponse<List<Map<String, Object>>> plans() {
        return ApiResponse.ok(PLANS);
    }
}
