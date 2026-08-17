package com.researchos.security;

import com.researchos.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 生成与解析工具。
 *
 * @author myf
 * @since 2026-07-08
 */
@Component
public class JwtTokenProvider {

    private final AppProperties props;
    private final SecretKey key;

    public JwtTokenProvider(AppProperties props) {
        this.props = props;
        this.key = Keys.hmacShaKeyFor(
                props.getJwt().getSecret().getBytes(StandardCharsets.UTF_8));
    }

    /** 生成 access token */
    public String generateAccessToken(Long userId, String email, String plan) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + props.getJwt().getAccessTtl().toMillis());
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("email", email)
                .claim("plan", plan)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /** 解析并验证 token */
    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isValid(String token) {
        try {
            parse(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
