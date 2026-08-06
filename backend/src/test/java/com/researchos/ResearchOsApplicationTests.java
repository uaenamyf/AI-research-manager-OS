package com.researchos;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 应用启动测试：验证 Spring 上下文能正常加载。
 *
 * @author myf
 * @since 2026-07-21
 */
@SpringBootTest
@ActiveProfiles("test")
class ResearchOsApplicationTests {

    @Test
    void contextLoads() {
        // 仅验证上下文能正常启动，无报错即可
    }
}
