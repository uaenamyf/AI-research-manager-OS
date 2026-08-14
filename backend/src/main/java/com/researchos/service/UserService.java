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

    /**
     * 升级用户订阅档位（仅允许升级，不允许降级）。
     */
    void upgradePlan(Long userId, String plan);
}
