package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.dto.CheckoutResponse;
import com.researchos.entity.Paper;
import com.researchos.entity.User;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.SubscriptionService;
import com.researchos.service.UserService;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 订阅服务实现：额度校验 + Stripe 订阅（Checkout / Webhook 升级）。
 * Stripe 未配置（无 secret key）时，checkout 会返回明确提示，额度校验按配置开关执行
 * （app.subscription.enforce-quota，开发阶段默认关闭，生产用 ENFORCE_QUOTA=true 打开）。
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubscriptionServiceImpl implements SubscriptionService {

    private static final Map<String, Integer> PLAN_LIMITS = Map.of(
            "FREE", 10,
            "PRO", 500,
            "RESEARCHER", Integer.MAX_VALUE
    );

    private static final Map<String, String> PLAN_LABELS = Map.of(
            "FREE", "Free",
            "PRO", "Pro",
            "RESEARCHER", "Researcher"
    );

    private final PaperMapper paperMapper;
    private final UserService userService;
    private final AppProperties appProperties;

    @PostConstruct
    void initStripeKey() {
        if (appProperties.getStripe().isConfigured()) {
            Stripe.apiKey = appProperties.getStripe().getSecretKey();
            log.info("Stripe 已配置（webhook secret 就绪：{}）",
                    appProperties.getStripe().getWebhookSecret() != null);
        } else {
            log.warn("STRIPE_SECRET_KEY 未配置，订阅升级功能不可用（额度校验默认关闭，ENFORCE_QUOTA=true 可启用）");
        }
    }

    /**
     * 校验上传额度。
     * 开发阶段默认关闭（app.subscription.enforce-quota=false），生产用 ENFORCE_QUOTA=true 打开。
     */
    @Override
    public void checkQuota(Long userId, String plan) {
        if (!appProperties.getSubscription().isEnforceQuota()) return;
        int limit = PLAN_LIMITS.getOrDefault(plan, 10);
        if (limit == Integer.MAX_VALUE) return;

        // 本月上传数
        LocalDateTime monthStart = LocalDateTime.now()
                .withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0);
        Long count = paperMapper.selectCount(
                new LambdaQueryWrapper<Paper>()
                        .eq(Paper::getUserId, userId)
                        .ge(Paper::getCreatedTime, monthStart));
        if (count >= limit) {
            throw new BusinessException(ErrorCode.QUOTA_EXCEEDED);
        }
    }

    /**
     * 创建 Stripe Checkout 会话（订阅升级）。
     */
    @Override
    public CheckoutResponse createCheckout(User user, String targetPlan) {
        if (!appProperties.getStripe().isConfigured()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR.getCode(),
                    "Stripe is not configured. Please contact the administrator");
        }
        if (!PLAN_LIMITS.containsKey(targetPlan) || "FREE".equals(targetPlan)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST.getCode(),
                    "Unsupported plan: " + targetPlan);
        }
        String priceId = "RESEARCHER".equals(targetPlan)
                ? appProperties.getStripe().getPriceResearcher()
                : appProperties.getStripe().getPricePro();
        if (priceId == null || priceId.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR.getCode(),
                    "Stripe price is not configured for plan: " + targetPlan);
        }

        String frontendBase = frontendBaseUrl();
        SessionCreateParams params = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
                // 回调时用 client_reference_id 定位用户
                .setClientReferenceId(String.valueOf(user.getId()))
                // 回调时用 metadata 确认目标档位
                .putMetadata("plan", targetPlan)
                .setCustomerEmail(user.getEmail())
                .setSuccessUrl(frontendBase + "/settings?upgrade=success")
                .setCancelUrl(frontendBase + "/settings?upgrade=cancelled")
                .addLineItem(SessionCreateParams.LineItem.builder()
                        .setPrice(priceId)
                        .setQuantity(1L)
                        .build())
                .build();

        try {
            Session session = Session.create(params);
            return new CheckoutResponse(session.getUrl(), session.getId());
        } catch (StripeException e) {
            log.error("创建 Stripe Checkout 会话失败: userId={}, plan={}, error={}",
                    user.getId(), targetPlan, e.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR.getCode(),
                    "Failed to create checkout session: " + e.getMessage());
        }
    }

    /**
     * 处理 Stripe Webhook 事件，返回是否消费了事件（checkout.session.completed）。
     * 幂等：仅允许升级，不降级。
     */
    @Override
    @Transactional
    public boolean handleWebhookEvent(String payload, String signatureHeader) {
        String webhookSecret = appProperties.getStripe().getWebhookSecret();
        if (webhookSecret == null || webhookSecret.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR.getCode(),
                    "Stripe webhook secret is not configured");
        }
        Event event;
        try {
            event = Webhook.constructEvent(payload, signatureHeader, webhookSecret);
        } catch (Exception e) {
            log.warn("Stripe Webhook 签名校验失败: {}", e.getMessage());
            throw new BusinessException(ErrorCode.BAD_REQUEST.getCode(), "Invalid webhook signature");
        }

        if ("checkout.session.completed".equals(event.getType())) {
            Session session = (Session) event.getData().getObject();
            String clientRef = session.getClientReferenceId();
            String plan = session.getMetadata() == null ? null : session.getMetadata().get("plan");
            if (clientRef == null || plan == null) {
                log.warn("checkout.session.completed 缺少 client_reference_id/plan: session={}",
                        session.getId());
                return true; // 已消费，避免 Stripe 反复重试无意义事件
            }
            userService.upgradePlan(Long.parseLong(clientRef), plan);
            log.info("Stripe 订阅完成，用户升级: userId={}, plan={}", clientRef, plan);
            return true;
        }

        if ("customer.subscription.deleted".equals(event.getType())) {
            // 订阅取消 → 降级为 FREE（仅当当前档位与 metadata 一致时）
            var subscription = (com.stripe.model.Subscription) event.getData().getObject();
            String clientRef = subscription.getMetadata() == null ? null : subscription.getMetadata().get("userId");
            if (clientRef != null) {
                log.info("Stripe 订阅取消: userId={}", clientRef);
                // 预留：可按需调用 userService 降级，MVP 不主动降级（避免误伤）
            }
            return true;
        }
        return false;
    }

    /** 取 CORS 配置的第一个来源作为前端回跳地址（未配置时回退 localhost）。 */
    private String frontendBaseUrl() {
        List<String> origins = appProperties.getCors().getAllowedOrigins();
        if (origins == null || origins.isEmpty()) {
            return "http://localhost:3000";
        }
        return origins.get(0).replaceAll("/+$", "");
    }
}
