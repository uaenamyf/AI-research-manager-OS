package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.dto.AuthResponse;
import com.researchos.dto.LoginRequest;
import com.researchos.dto.RegisterRequest;
import com.researchos.security.JwtTokenProvider;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.dto.UserDto;
import com.researchos.entity.User;
import com.researchos.service.UserService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

/**
 * 认证服务：注册、登录、登出。
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserService userService;
    private final JwtTokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public AuthResponse register(RegisterRequest req, HttpServletResponse response) {
        if (userService.findByEmail(req.getEmail()) != null) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        User user = new User();
        user.setEmail(req.getEmail());
        user.setPassword(passwordEncoder.encode(req.getPassword()));
        user.setPlan("FREE");
        user.setCreatedTime(OffsetDateTime.now());
        userService.save(user);

        setTokenCookie(response, user);
        return new AuthResponse(toDto(user));
    }

    public AuthResponse login(LoginRequest req, HttpServletResponse response) {
        User user = userService.findByEmail(req.getEmail());
        if (user == null || !passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        setTokenCookie(response, user);
        return new AuthResponse(toDto(user));
    }

    public void logout(HttpServletResponse response) {
        Cookie cookie = new Cookie("access_token", "");
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }

    private void setTokenCookie(HttpServletResponse response, User user) {
        String token = tokenProvider.generateAccessToken(user.getId(), user.getEmail(), user.getPlan());
        Cookie cookie = new Cookie("access_token", token);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(30 * 60);
        response.addCookie(cookie);
    }

    public UserDto toDto(User user) {
        UserDto dto = new UserDto();
        dto.setId(user.getId());
        dto.setEmail(user.getEmail());
        dto.setPlan(user.getPlan());
        dto.setCreatedTime(user.getCreatedTime());
        return dto;
    }
}
