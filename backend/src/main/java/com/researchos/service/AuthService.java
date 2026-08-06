package com.researchos.service;

import com.researchos.dto.AuthResponse;
import com.researchos.dto.LoginRequest;
import com.researchos.dto.RegisterRequest;
import com.researchos.dto.UserDto;
import com.researchos.entity.User;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 认证服务：注册、登录、登出。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface AuthService {

    /**
     * 注册新用户。
     */
    AuthResponse register(RegisterRequest req, HttpServletResponse response);

    /**
     * 登录。
     */
    AuthResponse login(LoginRequest req, HttpServletResponse response);

    /**
     * 登出。
     */
    void logout(HttpServletResponse response);

    /**
     * 签发 JWT 并写入 httpOnly cookie（注册/登录/OAuth 回调共用）。
     */
    void setTokenCookie(HttpServletResponse response, User user);

    /**
     * 转 DTO。
     */
    UserDto toDto(User user);
}
