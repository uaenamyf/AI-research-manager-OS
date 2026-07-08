package com.researchos.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 请求 presigned POST 参数。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
public class UploadUrlRequest {
    @NotBlank
    private String fileName;
    @NotBlank
    private String contentType;
}
