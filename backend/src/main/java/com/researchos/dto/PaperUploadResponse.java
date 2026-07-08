package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 论文上传响应，与前端 PaperUploadResponse 对齐。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@AllArgsConstructor
public class PaperUploadResponse {
    private Long paperId;
    private String status;
}
