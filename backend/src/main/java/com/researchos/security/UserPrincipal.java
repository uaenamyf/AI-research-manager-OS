package com.researchos.security;

import com.researchos.entity.User;
import lombok.AllArgsConstructor;
import lombok.Data;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.Collections;

/**
 * Spring Security 的 UserDetails 实现，包装 User 实体。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@AllArgsConstructor
public class UserPrincipal implements UserDetails {

    private final Long id;
    private final String email;
    private final String plan;

    public UserPrincipal(User user) {
        this.id = user.getId();
        this.email = user.getEmail();
        this.plan = user.getPlan();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.emptyList();
    }

    @Override
    public String getPassword() {
        return "";
    }

    @Override
    public String getUsername() {
        return email;
    }
}
