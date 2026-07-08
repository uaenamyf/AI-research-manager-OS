package com.researchos.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 创建项目请求。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
public class ProjectCreateRequest {
    @NotBlank
    private String name;
    private String description;
    private String domain;
}
