package com.researchos;

import com.researchos.entity.User;
import com.researchos.mapper.UserMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PostgreSQL 集成测试 - 使用 Testcontainers 启动真实数据库。
 * 测试 MyBatis Plus 与真实 PostgreSQL 的交互。
 *
 * 注意：运行此测试需要 Docker 环境。
 * CI 中会自动运行，本地开发如无 Docker 可忽略。
 *
 * @author myf
 * @since 2026-07-23
 */
@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class PostgresIntegrationTest {

    /**
     * 使用 pgvector 镜像（与生产环境一致）。
     * 测试向量存储能力。
     */
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16")
                    .asCompatibleSubstituteFor("postgres")
    );

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private UserMapper userMapper;

    @BeforeAll
    static void beforeAll() {
        // 验证容器已启动
        assertTrue(postgres.isRunning());
        System.out.println("Test PostgreSQL started at: " + postgres.getJdbcUrl());
    }

    @Test
    void testDatabaseConnection() {
        // 验证数据库连接正常
        assertNotNull(postgres.getJdbcUrl());
        assertTrue(postgres.isRunning());
    }

    @Test
    void testUserCrudOperations() {
        // 1. 创建用户
        User user = new User();
        user.setEmail("integration-test@example.com");
        user.setPassword("hashed-password");
        user.setPlan("FREE");

        int inserted = userMapper.insert(user);
        assertEquals(1, inserted);
        assertNotNull(user.getId());

        // 2. 查询用户
        User found = userMapper.selectById(user.getId());
        assertNotNull(found);
        assertEquals("integration-test@example.com", found.getEmail());
        assertEquals("FREE", found.getPlan());

        // 3. 更新用户
        found.setPlan("PRO");
        int updated = userMapper.updateById(found);
        assertEquals(1, updated);

        // 验证更新
        User updatedUser = userMapper.selectById(user.getId());
        assertEquals("PRO", updatedUser.getPlan());

        // 4. 删除用户
        int deleted = userMapper.deleteById(user.getId());
        assertEquals(1, deleted);

        // 验证删除
        User deletedUser = userMapper.selectById(user.getId());
        assertNull(deletedUser);
    }
}
