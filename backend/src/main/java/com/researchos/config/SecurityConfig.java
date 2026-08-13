package com.researchos.config;

import com.researchos.security.JwtAuthFilter;
import com.researchos.security.OAuth2LoginSuccessHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Spring Security 配置：禁用 session，JWT 鉴权，OAuth2 登录。
 *
 * @author myf
 * @since 2026-07-08
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final AppProperties appProperties;
    private final OAuth2LoginSuccessHandler oauth2LoginSuccessHandler;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(request -> {
                var config = new org.springframework.web.cors.CorsConfiguration();
                config.setAllowedOrigins(appProperties.getCors().getAllowedOrigins());
                config.setAllowedMethods(java.util.List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
                config.setAllowedHeaders(java.util.List.of("*"));
                config.setAllowCredentials(true);
                config.setMaxAge(3600L);
                return config;
            }))
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // 认证相关放行
                .requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/logout").permitAll()
                .requestMatchers("/api/auth/oauth/**").permitAll()
                // OAuth2 回调端点（浏览器从 Google 跳回）
                .requestMatchers("/login/oauth2/code/*").permitAll()
                // 内部回调端点（用 X-Internal-Token 校验，不走 JWT）
                .requestMatchers("/internal/**").permitAll()
                // 文件下载端点：JWT 认证或 X-Internal-Token 均可（FileController 内校验）
                .requestMatchers("/api/files/**").permitAll()
                // 健康检查
                .requestMatchers("/actuator/**", "/api/health").permitAll()
                // OPTIONS 预检放行
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // SSE 异步 dispatch 放行（SseEmitter 触发的 ASYNC 请求）
                .dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ASYNC).permitAll()
                .anyRequest().authenticated()
            )
            .oauth2Login(oauth2 -> oauth2
                .loginPage("/api/auth/oauth/google")
                .successHandler(oauth2LoginSuccessHandler))
            // REST 无状态 API：未认证返回 401 JSON，而不是 302 重定向到登录页
            .exceptionHandling(ex -> ex.authenticationEntryPoint((request, response, authException) -> {
                response.setStatus(401);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"code\":401,\"message\":\"未登录或登录已过期\",\"data\":null}");
            }))
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
