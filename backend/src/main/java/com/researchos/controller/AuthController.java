package com.researchos.controller;

import com.researchos.dto.AuthResponse;
import com.researchos.dto.LoginRequest;
import com.researchos.dto.RegisterRequest;
import com.researchos.security.UserPrincipal;
import com.researchos.service.AuthService;
import com.researchos.common.response.ApiResponse;
import com.researchos.security.CurrentUserResolver;
import com.researchos.dto.UserDto;
import com.researchos.entity.User;
import com.researchos.service.UserService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * 认证控制器。
 *
 * @author myf
 * @since 2026-07-08
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final UserService userService;
    private final CurrentUserResolver currentUserResolver;

    @PostMapping("/register")
    public ApiResponse<AuthResponse> register(
            @Valid @RequestBody RegisterRequest req,
            HttpServletResponse response) {
        return ApiResponse.ok(authService.register(req, response));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(
            @Valid @RequestBody LoginRequest req,
            HttpServletResponse response) {
        return ApiResponse.ok(authService.login(req, response));
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletResponse response) {
        authService.logout(response);
        return ApiResponse.ok();
    }

    @GetMapping("/me")
    public ApiResponse<UserDto> me() {
        Long userId = currentUserResolver.requireUserId();
        User user = userService.requireUser(userId);
        return ApiResponse.ok(authService.toDto(user));
    }

    @GetMapping("/oauth/google")
    public void googleOAuth(HttpServletResponse response) {
        // 简化：重定向到 Google OAuth（实际用 oauth2-client 处理回调）
        // 生产环境应走 Spring Security OAuth2 流程
        throw new UnsupportedOperationException("Google OAuth 走 Spring Security OAuth2 流程");
    }
}
