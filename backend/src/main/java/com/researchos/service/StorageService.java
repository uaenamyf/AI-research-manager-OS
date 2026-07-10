package com.researchos.service;

import com.researchos.dto.PresignedPostResponse;

/**
 * 对象存储服务：签发 presigned URL。
 * 支持 S3 / Cloudflare R2（兼容 S3 API）。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface StorageService {

    /**
     * 签发 presigned PUT URL（前端直传）。
     */
    PresignedPostResponse presignUpload(String fileName, String contentType);

    /**
     * 生成下载用 signed URL（有效期 15min）。
     */
    String getSignedDownloadUrl(String key);
}
