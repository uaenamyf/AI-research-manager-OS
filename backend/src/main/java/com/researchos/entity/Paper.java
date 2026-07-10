package com.researchos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.researchos.common.handler.JsonbTypeHandler;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * 论文实体。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@TableName(value = "paper", autoResultMap = true)
public class Paper {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long projectId;
    private Long userId;
    private String title;
    private String authors;
    private Integer year;
    private String doi;
    private String pdfUrl;
    private String status;
    private OffsetDateTime createdTime;

    /** Paper Intelligence Card，存 JSONB */
    @TableField(typeHandler = JsonbTypeHandler.class)
    private Map<String, Object> summary;
}
