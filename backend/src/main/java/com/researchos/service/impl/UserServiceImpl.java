package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.entity.User;
import com.researchos.mapper.UserMapper;
import com.researchos.service.UserService;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 用户服务实现：查询与额度校验。
 *
 * @author myf
 * @since 2026-07-08
 */
@Service
public class UserServiceImpl extends ServiceImpl<UserMapper, User> implements UserService {

    /** 档位优先级（数字越大权限越高），用于「仅升级不降级」。 */
    private static final Map<String, Integer> PLAN_RANK = Map.of(
            "FREE", 0,
            "PRO", 1,
            "RESEARCHER", 2
    );

    /**
     * 按邮箱查询用户。
     */
    @Override
    public User findByEmail(String email) {
        return getOne(new LambdaQueryWrapper<User>()
                .eq(User::getEmail, email));
    }

    /**
     * 按 OAuth 查询用户。
     */
    @Override
    public User findByOauth(String provider, String oauthId) {
        return getOne(new LambdaQueryWrapper<User>()
                .eq(User::getOauthProvider, provider)
                .eq(User::getOauthId, oauthId));
    }

    /**
     * 获取用户，不存在抛异常。
     */
    @Override
    public User requireUser(Long userId) {
        User user = getById(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return user;
    }

    /**
     * 升级用户订阅档位（仅允许升级，不允许降级，保证 Webhook 乱序/重试幂等）。
     */
    @Override
    public void upgradePlan(Long userId, String plan) {
        User user = requireUser(userId);
        String current = user.getPlan() == null ? "FREE" : user.getPlan();
        int curRank = PLAN_RANK.getOrDefault(current, 0);
        int newRank = PLAN_RANK.getOrDefault(plan, 0);
        if (newRank <= curRank) {
            return; // 不降级
        }
        user.setPlan(plan);
        updateById(user);
    }
}
