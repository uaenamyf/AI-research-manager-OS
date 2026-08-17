/** 订阅相关 API：Stripe Checkout 升级。 */
import { apiFetch } from "./client";

export interface CheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
}

/** 创建订阅 Checkout 会话，返回 Stripe 支付页地址。 */
export function createCheckout(plan: string): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/api/subscription/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}
