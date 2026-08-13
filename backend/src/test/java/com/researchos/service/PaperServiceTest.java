package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.dto.PaperCreateRequest;
import com.researchos.dto.PaperUploadResponse;
import com.researchos.entity.Paper;
import com.researchos.entity.ResearchProject;
import com.researchos.entity.User;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.impl.PaperServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * 论文服务单元测试。
 *
 * @author myf
 * @since 2026-07-23
 */
@ExtendWith(MockitoExtension.class)
class PaperServiceTest {

    @Mock
    private ProjectService projectService;

    @Mock
    private RabbitTemplate rabbitTemplate;

    @Mock
    private SubscriptionService subscriptionService;

    @Mock
    private UserService userService;

    @Mock
    private PaperMapper paperMapper;

    @InjectMocks
    private PaperServiceImpl paperService;

    private static final Long TEST_USER_ID = 1L;
    private static final Long TEST_PROJECT_ID = 10L;

    private ResearchProject testProject;
    private Paper testPaper;
    private User testUser;

    @BeforeEach
    void setUp() {
        // 手动注入 baseMapper（MyBatis Plus ServiceImpl 持有，@InjectMocks 按类型注入有歧义）
        ReflectionTestUtils.setField(paperService, "baseMapper", paperMapper);

        testUser = new User();
        testUser.setId(TEST_USER_ID);
        testUser.setEmail("test@example.com");
        testUser.setPlan("FREE");

        testProject = new ResearchProject();
        testProject.setId(TEST_PROJECT_ID);
        testProject.setUserId(TEST_USER_ID);
        testProject.setName("Test Project");

        testPaper = new Paper();
        testPaper.setId(100L);
        testPaper.setUserId(TEST_USER_ID);
        testPaper.setProjectId(TEST_PROJECT_ID);
        testPaper.setTitle("Test Paper");
        testPaper.setStatus("READY");
        testPaper.setCreatedTime(LocalDateTime.now());
    }

    @Test
    void testCreatePaper_Success() {
        // 模拟：项目存在且归属正确
        when(projectService.requireProjectOwnedBy(TEST_PROJECT_ID, TEST_USER_ID))
                .thenReturn(testProject);

        // 模拟：用户存在（createPaper 先 requireUser 取 plan 再 checkQuota）
        when(userService.requireUser(TEST_USER_ID)).thenReturn(testUser);

        // 模拟：额度检查通过
        doNothing().when(subscriptionService).checkQuota(TEST_USER_ID, "FREE");

        // 模拟：插入成功
        when(paperMapper.insert(any(Paper.class))).thenAnswer(invocation -> {
            Paper paper = invocation.getArgument(0);
            paper.setId(100L);
            return 1;
        });

        PaperCreateRequest request = new PaperCreateRequest();
        request.setFileName("test-paper.pdf");
        request.setS3Key("papers/123/test.pdf");

        PaperUploadResponse response = paperService.createPaper(TEST_USER_ID, TEST_PROJECT_ID, request);

        assertNotNull(response);
        assertEquals(100L, response.getPaperId());
        assertEquals("PROCESSING", response.getStatus());

        // 验证 MQ 消息发送（3 参：exchange, routingKey, message）
        verify(rabbitTemplate, times(1)).convertAndSend(
                eq(com.researchos.config.RabbitConfig.EXCHANGE_AI_TASK),
                eq(com.researchos.config.RabbitConfig.ROUTING_PAPER_ANALYZE),
                any(Object.class)
        );
    }

    @Test
    void testCreatePaper_QuotaExceeded_ShouldThrow() {
        // 模拟：用户存在（否则 requireUser 返回 null 先于 checkQuota 抛 NPE）
        when(userService.requireUser(TEST_USER_ID)).thenReturn(testUser);

        // 模拟：额度检查失败
        doThrow(new RuntimeException("Quota exceeded"))
                .when(subscriptionService).checkQuota(TEST_USER_ID, "FREE");

        PaperCreateRequest request = new PaperCreateRequest();
        request.setFileName("test-paper.pdf");
        request.setS3Key("papers/123/test.pdf");

        assertThrows(RuntimeException.class, () ->
                paperService.createPaper(TEST_USER_ID, TEST_PROJECT_ID, request)
        );

        // 验证：额度超限后不应发送 MQ 消息
        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
    }

    @Test
    void testCreatePaper_ProjectNotOwned_ShouldThrow() {
        // 模拟：项目归属校验失败
        when(projectService.requireProjectOwnedBy(TEST_PROJECT_ID, TEST_USER_ID))
                .thenThrow(new RuntimeException("Project not found"));

        PaperCreateRequest request = new PaperCreateRequest();
        request.setFileName("test-paper.pdf");
        request.setS3Key("papers/123/test.pdf");

        assertThrows(RuntimeException.class, () ->
                paperService.createPaper(TEST_USER_ID, TEST_PROJECT_ID, request)
        );
    }

    @Test
    void testRequirePaperOwnedBy_Success() {
        when(paperMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(testPaper);

        Paper result = paperService.requirePaperOwnedBy(100L, TEST_USER_ID);

        assertNotNull(result);
        assertEquals(100L, result.getId());
        assertEquals("Test Paper", result.getTitle());
    }

    @Test
    void testRequirePaperOwnedBy_NotFound_ShouldThrow() {
        when(paperMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(null);

        assertThrows(RuntimeException.class, () ->
                paperService.requirePaperOwnedBy(999L, TEST_USER_ID)
        );
    }

    @Test
    void testRequirePaperOwnedBy_WrongUser_ShouldThrow() {
        // requirePaperOwnedBy 的查询条件含 userId，其他用户的论文查不到
        when(paperMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(null);

        assertThrows(RuntimeException.class, () ->
                paperService.requirePaperOwnedBy(100L, TEST_USER_ID)
        );
    }
}
