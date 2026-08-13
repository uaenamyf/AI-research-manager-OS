package com.researchos.security;

import com.researchos.config.AppProperties;
import com.researchos.entity.User;
import com.researchos.service.AuthService;
import com.researchos.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.LocalDateTime;

/**
 * Google OAuth 登录成功处理器：
 * 查找/创建用户 → 签发 JWT cookie → 重定向前端。
 *
 * @author myf
 * @since 2026-08-06
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OAuth2LoginSuccessHandler implements AuthenticationSuccessHandler {

    private final UserService userService;
    private final AuthService authService;
    private final AppProperties appProperties;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        OAuth2AuthenticationToken token = (OAuth2AuthenticationToken) authentication;
        OAuth2User oauthUser = token.getPrincipal();
        String provider = token.getAuthorizedClientRegistrationId();
        // 注意：OAuth2User.getAttribute 是泛型方法，需显式 Object 中转，
        // 避免 javac 目标类型推断选中 String.valueOf(char[]) 重载导致运行期强转异常
        Object subAttr = oauthUser.getAttribute("sub");
        String oauthId = subAttr != null ? subAttr.toString() : "";
        String email = oauthUser.getAttribute("email");

        if (email == null || email.isBlank()) {
            log.warn("OAuth 登录缺少 email（provider={}）", provider);
            response.sendRedirect(frontendOrigin() + "/login?oauth=error");
            return;
        }

        try {
            User user = userService.findByOauth(provider, oauthId);
            if (user == null) {
                user = userService.findByEmail(email);
                if (user == null) {
                    // 首次 OAuth 登录：自动创建账号
                    user = new User();
                    user.setEmail(email);
                    user.setPlan("FREE");
                    user.setCreatedTime(LocalDateTime.now());
                    userService.save(user);
                }
                // 已有邮箱账号：绑定 OAuth 身份（下次可用 OAuth 直接登录）
                user.setOauthProvider(provider);
                user.setOauthId(oauthId);
                userService.updateById(user);
            }
            authService.setTokenCookie(response, user);
            response.sendRedirect(frontendOrigin() + "/dashboard?oauth=success");
        } catch (Exception e) {
            log.error("OAuth 登录失败（email={}）", email, e);
            response.sendRedirect(frontendOrigin() + "/login?oauth=error");
        }
    }

    private String frontendOrigin() {
        return appProperties.getCors().getAllowedOrigins().stream()
                .findFirst()
                .orElse("http://localhost:3000");
    }
}
