package com.researchos.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 机器翻译请求（翻译器翻译，非 LLM）。
 *
 * @author myf
 * @since 2026-08-12
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class MachineTranslateRequest {
    /** 待翻译文本（限制长度避免超限） */
    @NotBlank
    private String text;
    /** 目标语言代码（Google 风格，如 zh-CN / en / ja），默认 zh-CN */
    private String targetLang = "zh-CN";
}
