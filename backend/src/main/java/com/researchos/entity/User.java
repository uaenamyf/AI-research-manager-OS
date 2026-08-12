package com.researchos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.researchos.common.handler.JsonbTypeHandler;
import com.researchos.dto.UserSettings;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 用户实体。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@TableName(value = "app_user", autoResultMap = true)
public class User {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String email;
    private String password;
    private String oauthProvider;
    private String oauthId;
    private String plan;

    // 2026-08-12 myf: 新增用户级配置 JSONB 字段（LLM/翻译/Knowledge 等偏好）
    @TableField(typeHandler = JsonbTypeHandler.class)
    private UserSettings settings;

    private OffsetDateTime createdTime;
}
