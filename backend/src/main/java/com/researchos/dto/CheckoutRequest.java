package com.researchos.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 订阅 Checkout 请求：选择要升级的档位。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
public class CheckoutRequest {

    /** 目标档位：PRO / RESEARCHER。 */
    @NotBlank
    private String plan;
}
