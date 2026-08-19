package com.researchos.security;

import com.researchos.config.AppProperties;
import com.researchos.entity.User;
import com.researchos.service.AuthService;
import com.researchos.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Google OAuth 登录成功处理器单元测试。
 *
 * @author myf
 * @since 2026-08-06
 */
class OAuth2LoginSuccessHandlerTest {

    private UserService userService;
    private AuthService authService;
    private AppProperties appProperties;
    private OAuth2LoginSuccessHandler handler;

    @BeforeEach
    void setUp() {
        userService = mock(UserService.class);
        authService = mock(AuthService.class);
        appProperties = mock(AppProperties.class);
        AppProperties.Cors cors = new AppProperties.Cors();
        cors.setAllowedOrigins(java.util.List.of("http://localhost:3080"));
        when(appProperties.getCors()).thenReturn(cors);
        handler = new OAuth2LoginSuccessHandler(userService, authService, appProperties);
    }

    private OAuth2AuthenticationToken tokenWith(String email, String sub) {
        DefaultOAuth2User oauthUser = new DefaultOAuth2User(
                AuthorityUtils.createAuthorityList("ROLE_USER"),
                Map.of("email", email, "sub", sub),
                "email");
        return new OAuth2AuthenticationToken(oauthUser, oauthUser.getAuthorities(), "google");
    }

    @Test
    void testExistingOauthUser_SetsCookieAndRedirects() throws Exception {
        User user = new User();
        user.setId(1L);
        user.setEmail("existing@example.com");
        when(userService.findByOauth("google", "sub-1")).thenReturn(user);

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, tokenWith("existing@example.com", "sub-1"));

        verify(authService).setTokenCookie(response, user);
        verify(userService, never()).save(any(User.class));
        assertEquals("http://localhost:3080/dashboard?oauth=success", response.getRedirectedUrl());
    }

    @Test
    void testNewOauthUser_CreatesAccountAndRedirects() throws Exception {
        when(userService.findByOauth("google", "sub-2")).thenReturn(null);
        when(userService.findByEmail("new@example.com")).thenReturn(null);

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, tokenWith("new@example.com", "sub-2"));

        verify(userService).save(any(User.class));
        verify(authService).setTokenCookie(eq(response), any(User.class));
        assertEquals("http://localhost:3080/dashboard?oauth=success", response.getRedirectedUrl());
    }

    @Test
    void testMissingEmail_RedirectsToLoginError() throws Exception {
        DefaultOAuth2User oauthUser = new DefaultOAuth2User(
                AuthorityUtils.createAuthorityList("ROLE_USER"),
                Map.of("sub", "sub-3"),
                "sub");
        OAuth2AuthenticationToken token = new OAuth2AuthenticationToken(
                oauthUser, oauthUser.getAuthorities(), "google");

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, token);

        verify(userService, never()).save(any(User.class));
        verify(authService, never()).setTokenCookie(eq(response), any(User.class));
        assertTrue(response.getRedirectedUrl().contains("/login?oauth=error"));
    }
}
