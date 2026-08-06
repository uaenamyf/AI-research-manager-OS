package com.researchos.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Writing Agent 变换请求。
 *
 * <p>action 支持：rewrite（改写）/ polish（润色）/
 * review_response（回复审稿人）/ cover_letter（Cover letter）。</p>
 *
 * @author myf
 * @since 2026-08-06
 */
@Data
@AllArgsConstructor
public class WritingTransformRequest {

    @NotBlank(message = "text 不能为空")
    @Size(max = 20000, message = "text 长度不能超过 20000")
    private String text;

    @NotBlank(message = "action 不能为空")
    private String action;
}
