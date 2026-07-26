package com.researchos.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 文本改写请求，与前端 WritingRewriteRequest 对齐。
 *
 * @author myf
 * @since 2026-07-26
 */
@Data
public class WritingRewriteRequest {
    @NotBlank
    private String text;
    /** 改写动作：polish | expand | shorten | translate | rebuttal | cover_letter */
    @NotBlank
    private String action;
    /** 可选额外指令（如翻译目标语言、审稿意见内容） */
    private String instruction = "";
}
