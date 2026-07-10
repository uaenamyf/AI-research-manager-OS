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
 * AI 任务实体。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@TableName(value = "ai_task", autoResultMap = true)
public class AiTask {

    @TableId(value = "task_id", type = IdType.AUTO)
    private Long taskId;
    private Long userId;
    private String type;
    private String status;
    @TableField(typeHandler = JsonbTypeHandler.class)
    private Map<String, Object> result;
    private String error;
    private OffsetDateTime createdTime;
}
