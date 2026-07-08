package com.researchos.common.response;

import java.util.List;

/**
 * 分页响应，与前端 Page&lt;T&gt; 对齐。
 *
 * @author myf
 * @since 2026-07-08
 */
public record PageResponse<T>(
        List<T> items,
        int page,
        int size,
        long total,
        int totalPages
) {
    public static <T> PageResponse<T> of(List<T> items, long total, int page, int size) {
        int totalPages = size > 0 ? (int) Math.ceil((double) total / size) : 0;
        return new PageResponse<>(items, page, size, total, totalPages);
    }
}
