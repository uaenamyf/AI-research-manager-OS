package com.researchos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 用户实体。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@TableName("app_user")
public class User {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String email;
    private String password;
    private String oauthProvider;
    private String oauthId;
    private String plan;
    private OffsetDateTime createdTime;
}
