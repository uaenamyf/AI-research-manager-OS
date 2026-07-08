package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.entity.User;
import com.researchos.mapper.UserMapper;
import org.springframework.stereotype.Service;

/**
 * 用户服务：查询与额度校验。
 *
 * @author myf
 * @since 2026-07-08
 */
@Service
public class UserService extends ServiceImpl<UserMapper, User> {

    /**
     * 按邮箱查询用户。
     */
    public User findByEmail(String email) {
        return getOne(new LambdaQueryWrapper<User>()
                .eq(User::getEmail, email));
    }

    /**
     * 按 OAuth 查询用户。
     */
    public User findByOauth(String provider, String oauthId) {
        return getOne(new LambdaQueryWrapper<User>()
                .eq(User::getOauthProvider, provider)
                .eq(User::getOauthId, oauthId));
    }

    /**
     * 获取用户，不存在抛异常。
     */
    public User requireUser(Long userId) {
        User user = getById(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return user;
    }
}
