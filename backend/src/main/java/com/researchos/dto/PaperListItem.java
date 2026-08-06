package com.researchos.dto;

import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 论文列表项，与前端 PaperListItem 对齐。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
public class PaperListItem {
    private Long id;
    private String title;
    private String authors;
    private Integer year;
    private String status;
    private Long folderId;
    private OffsetDateTime createdTime;
}
