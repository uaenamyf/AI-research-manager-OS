package com.researchos.dto;

import lombok.Data;

/**
 * 创建论文记录请求（前端上传 S3 成功后调用）。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
public class PaperCreateRequest {
    private String fileName;
    private String s3Key;
    private String contentType;
}
