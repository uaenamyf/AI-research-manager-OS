package com.researchos.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

/**
 * 综述生成请求，与前端 ReviewGenerateRequest 对齐。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
public class ReviewGenerateRequest {
    @NotEmpty
    private List<Long> paperIds;
    @NotBlank
    private String topic;
}
