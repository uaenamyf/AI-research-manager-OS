package com.researchos.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.researchos.entity.User;

/**
 * 用户服务：查询与额度校验。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface UserService extends IService<User> {

    /**
     * 按邮箱查询用户。
     */
    User findByEmail(String email);

    /**
     * 按 OAuth 查询用户。
     */
    User findByOauth(String provider, String oauthId);

    /**
     * 获取用户，不存在抛异常。
     */
    User requireUser(Long userId);
}
