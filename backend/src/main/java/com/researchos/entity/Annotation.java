package com.researchos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 论文批注实体（Phase 3）。
 *
 * @author myf
 * @since 2026-08-15
 */
@Data
@TableName("annotation")
public class Annotation {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long paperId;
    private Long userId;
    private Integer pageNum;
    private Double x;
    private Double y;
    private Double width;
    private Double height;
    private String text;
    private String note;
    private String color;
    private LocalDateTime createdTime;
    private LocalDateTime updatedTime;
}