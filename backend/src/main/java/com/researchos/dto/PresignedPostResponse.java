package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.Map;

/**
 * presigned POST 响应，与前端 PresignedPost 对齐。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@AllArgsConstructor
public class PresignedPostResponse {
    private String url;
    private Map<String, String> fields;
}
