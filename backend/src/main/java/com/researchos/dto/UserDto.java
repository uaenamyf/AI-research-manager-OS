package com.researchos.dto;

import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 用户信息响应 DTO，与前端 User 对齐。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
public class UserDto {
    private Long id;
    private String email;
    private String plan;
    private OffsetDateTime createdTime;
}
