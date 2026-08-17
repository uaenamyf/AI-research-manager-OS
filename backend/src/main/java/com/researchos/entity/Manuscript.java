package com.researchos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 手稿实体（Writing 工作区保存的 .tex/.md 文档）。
 *
 * @author myf
 * @since 2026-08-16
 */
@Data
@TableName("manuscript")
public class Manuscript {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long projectId;
    private String title;
    private String format;
    private String content;
    private LocalDateTime createdTime;
    private LocalDateTime updatedTime;
}