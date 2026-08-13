package com.researchos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 研究项目实体。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@TableName("research_project")
public class ResearchProject {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String name;
    private String description;
    private String domain;
    private LocalDateTime createdTime;
}
