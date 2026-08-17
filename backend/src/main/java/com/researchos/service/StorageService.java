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

    /**
     * 删除对象存储中的文件（论文删除时清理，避免孤儿文件）。
     * 实现应尽力而为：删除失败记日志，不向调用方抛异常。
     *
     * @param key 对象 key（即 paper.pdf_url 中存的值）
     */
    void deleteFile(String key);
}
