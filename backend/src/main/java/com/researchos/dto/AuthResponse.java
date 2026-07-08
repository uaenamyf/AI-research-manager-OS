package com.researchos.dto;

import com.researchos.dto.UserDto;
import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 认证响应：{ user }。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@AllArgsConstructor
public class AuthResponse {
    private UserDto user;
}
