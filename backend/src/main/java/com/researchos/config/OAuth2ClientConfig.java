package com.researchos.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;

/**
 * OAuth2 客户端注册配置。
 * 仅在 app.oauth.google.client-id / client-secret 均配置时才注册 Google，
 * 避免空凭据导致应用启动失败。
 *
 * @author myf
 * @since 2026-08-06
 */
@Configuration
@RequiredArgsConstructor
public class OAuth2ClientConfig {

    private final AppProperties appProperties;

    @Bean
    public ClientRegistrationRepository clientRegistrationRepository() {
        String clientId = appProperties.getOauth().getGoogle().getClientId();
        String clientSecret = appProperties.getOauth().getGoogle().getClientSecret();
        if (clientId == null || clientId.isBlank()
                || clientSecret == null || clientSecret.isBlank()) {
            // 未配置 Google 凭据：返回空仓库，OAuth 入口会提示未配置。
            // 注意：InMemoryClientRegistrationRepository 不允许空注册，需自定义空实现。
            return registrationId -> null;
        }
        ClientRegistration google = ClientRegistration.withRegistrationId("google")
                .clientId(clientId)
                .clientSecret(clientSecret)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid", "email", "profile")
                .authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                .tokenUri("https://www.googleapis.com/oauth2/v4/token")
                .userInfoUri("https://www.googleapis.com/oauth2/v3/userinfo")
                .userNameAttributeName("sub")
                .jwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                .clientName("Google")
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }
}
