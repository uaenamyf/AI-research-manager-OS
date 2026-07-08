package com.researchos.security;

import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 当前登录用户上下文：从 SecurityContext 获取 userId。
 *
 * @author myf
 * @since 2026-07-08
 */
@Component
@RequiredArgsConstructor
public class CurrentUserResolver {

    /**
     * 获取当前登录用户 ID。
     * @throws BusinessException 未登录时抛 UNAUTHORIZED
     */
    public Long requireUserId() {
        var auth = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()
                || !(auth.getPrincipal() instanceof com.researchos.auth.security.UserPrincipal principal)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return principal.getId();
    }
}
