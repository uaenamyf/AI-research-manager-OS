package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.entity.User;
import com.researchos.mapper.UserMapper;
import com.researchos.service.impl.UserServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 用户服务单元测试。
 *
 * @author myf
 * @since 2026-07-23
 */
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserMapper userMapper;

    @InjectMocks
    private UserServiceImpl userService;

    private User testUser;

    @BeforeEach
    void setUp() {
        // 手动注入 baseMapper（MyBatis Plus ServiceImpl 持有，@InjectMocks 按类型注入有歧义）
        ReflectionTestUtils.setField(userService, "baseMapper", userMapper);

        testUser = new User();
        testUser.setId(1L);
        testUser.setEmail("test@example.com");
        testUser.setPassword("encoded-password");
        testUser.setPlan("FREE");
        testUser.setCreatedTime(LocalDateTime.now());
    }

    @Test
    void testFindByEmail_Found() {
        when(userMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(testUser);

        User result = userService.findByEmail("test@example.com");

        assertNotNull(result);
        assertEquals("test@example.com", result.getEmail());
    }

    @Test
    void testFindByEmail_NotFound() {
        when(userMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(null);

        User result = userService.findByEmail("notfound@example.com");

        assertNull(result);
    }

    @Test
    void testFindByOauth_Found() {
        testUser.setOauthProvider("google");
        testUser.setOauthId("google-123");
        when(userMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(testUser);

        User result = userService.findByOauth("google", "google-123");

        assertNotNull(result);
        assertEquals("google", result.getOauthProvider());
        assertEquals("google-123", result.getOauthId());
    }

    @Test
    void testFindByOauth_NotFound() {
        when(userMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(null);

        User result = userService.findByOauth("google", "notfound");

        assertNull(result);
    }

    @Test
    void testRequireUser_Success() {
        when(userMapper.selectById(1L)).thenReturn(testUser);

        User result = userService.requireUser(1L);

        assertNotNull(result);
        assertEquals(1L, result.getId());
    }

    @Test
    void testRequireUser_NotFound_ShouldThrow() {
        when(userMapper.selectById(999L)).thenReturn(null);

        assertThrows(BusinessException.class, () ->
                userService.requireUser(999L)
        );
    }
}
