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
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
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
    private final ClientRegistrationRepository clientRegistrationRepository;

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

    /**
     * Google OAuth 入口：重定向到 Spring Security 的授权端点。
     * 回调地址为 {backend}/login/oauth2/code/google（需在 Google Cloud Console 登记）。
     */
    @GetMapping("/oauth/google")
    public void googleOAuth(HttpServletResponse response) throws java.io.IOException {
        ClientRegistration google = clientRegistrationRepository.findByRegistrationId("google");
        if (google == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST.getCode(), "Google OAuth 未配置，请联系管理员");
        }
        response.sendRedirect("/oauth2/authorization/google");
    }
}
