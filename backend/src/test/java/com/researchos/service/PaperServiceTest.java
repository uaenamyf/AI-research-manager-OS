package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.dto.PaperCreateRequest;
import com.researchos.dto.PaperImportRequest;
import com.researchos.dto.PaperUploadResponse;
import com.researchos.entity.Annotation;
import com.researchos.entity.Paper;
import com.researchos.entity.ResearchProject;
import com.researchos.entity.User;
import com.researchos.mapper.AnnotationMapper;
import com.researchos.mapper.PaperMapper;
import com.researchos.service.impl.PaperServiceImpl;
import com.researchos.service.support.CrossrefService;
import com.researchos.service.support.CrossrefService.CrossrefMeta;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
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
    private CrossrefService crossrefService;

    @Mock
    private PaperMapper paperMapper;

    @Mock
    private AnnotationMapper annotationMapper;

    @Mock
    private StorageService storageService;

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
        testPaper.setPdfUrl("papers/abc/test-paper.pdf");
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

    @Test
    void testDeletePaper_SendsCleanupMessage() {
        // 归属校验通过
        when(paperMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(testPaper);
        when(paperMapper.deleteById(100L)).thenReturn(1);

        paperService.deletePaper(TEST_USER_ID, 100L);

        // 删除 MySQL 记录
        verify(paperMapper, times(1)).deleteById(100L);
        // 清理批注（annotation 无外键，手动删避免孤儿行）
        verify(annotationMapper, times(1)).delete(any(LambdaQueryWrapper.class));
        // 删除本地/S3 PDF 文件
        verify(storageService, times(1)).deleteFile("papers/abc/test-paper.pdf");
        // 发 paper.delete MQ，让 ai-service 清理 PG paper_chunk
        verify(rabbitTemplate, times(1)).convertAndSend(
                eq(com.researchos.config.RabbitConfig.EXCHANGE_AI_TASK),
                eq(com.researchos.config.RabbitConfig.ROUTING_PAPER_DELETE),
                any(Object.class)
        );
    }

    // 2026-08-17 myf: 导入路径存外链 PDF URL，不属于本系统存储，删除论文时不应调文件删除
    @Test
    void testDeletePaper_ExternalPdfUrl_SkipsFileDeletion() {
        testPaper.setPdfUrl("https://arxiv.org/pdf/2301.00001");
        when(paperMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(testPaper);
        when(paperMapper.deleteById(100L)).thenReturn(1);

        paperService.deletePaper(TEST_USER_ID, 100L);

        verify(storageService, never()).deleteFile(anyString());
        verify(rabbitTemplate, times(1)).convertAndSend(anyString(), anyString(), any(Object.class));
    }

    // 2026-08-17 myf: 无 PDF（pdf_url 为空）时不调用文件删除
    @Test
    void testDeletePaper_BlankPdfUrl_SkipsFileDeletion() {
        testPaper.setPdfUrl(null);
        when(paperMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(testPaper);
        when(paperMapper.deleteById(100L)).thenReturn(1);

        paperService.deletePaper(TEST_USER_ID, 100L);

        verify(storageService, never()).deleteFile(anyString());
    }

    @Test
    void testDeletePaper_NotOwned_ShouldNotSendCleanup() {
        // 归属校验失败（其他用户的论文查不到）
        when(paperMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(null);

        assertThrows(RuntimeException.class, () ->
                paperService.deletePaper(TEST_USER_ID, 999L)
        );

        // 不删记录、不发 MQ、不清理批注和文件
        verify(paperMapper, never()).deleteById(anyLong());
        verify(annotationMapper, never()).delete(any(LambdaQueryWrapper.class));
        verify(storageService, never()).deleteFile(anyString());
        verify(rabbitTemplate, never())
                .convertAndSend(anyString(), anyString(), any(Object.class));
    }

    // 2026-08-15 myf: 文献一键导入测试（Crossref 元数据补全 + PDF 直链触发分析）
    @Test
    void testImportPaper_WithDoi_EnrichedAndSendsAnalysis() {
        when(projectService.requireProjectOwnedBy(TEST_PROJECT_ID, TEST_USER_ID))
                .thenReturn(testProject);
        when(userService.requireUser(TEST_USER_ID)).thenReturn(testUser);
        doNothing().when(subscriptionService).checkQuota(TEST_USER_ID, "FREE");
        when(crossrefService.resolve("10.1234/example"))
                .thenReturn(Optional.of(new CrossrefMeta("Enriched Title", "Alice, Bob", 2024, "J. Test")));
        when(paperMapper.insert(any(Paper.class))).thenAnswer(invocation -> {
            Paper paper = invocation.getArgument(0);
            paper.setId(200L);
            return 1;
        });

        PaperImportRequest req = new PaperImportRequest();
        req.setDoi("10.1234/example");
        req.setPdfUrl("https://example.com/paper.pdf");

        Paper result = paperService.importPaper(TEST_USER_ID, TEST_PROJECT_ID, req);

        assertNotNull(result);
        assertEquals("Enriched Title", result.getTitle());
        assertEquals("Alice, Bob", result.getAuthors());
        assertEquals(2024, result.getYear());
        assertEquals("PROCESSING", result.getStatus());
        // 有 PDF 直链 → 发 MQ 触发分析
        verify(rabbitTemplate, times(1)).convertAndSend(
                eq(com.researchos.config.RabbitConfig.EXCHANGE_AI_TASK),
                eq(com.researchos.config.RabbitConfig.ROUTING_PAPER_ANALYZE),
                any(Object.class));
    }

    @Test
    void testImportPaper_WithoutPdf_MetadataOnlyUploaded() {
        when(projectService.requireProjectOwnedBy(TEST_PROJECT_ID, TEST_USER_ID))
                .thenReturn(testProject);
        when(userService.requireUser(TEST_USER_ID)).thenReturn(testUser);
        doNothing().when(subscriptionService).checkQuota(TEST_USER_ID, "FREE");
        // 无 DOI → 不查 Crossref
        when(paperMapper.insert(any(Paper.class))).thenAnswer(invocation -> {
            Paper paper = invocation.getArgument(0);
            paper.setId(201L);
            return 1;
        });

        PaperImportRequest req = new PaperImportRequest();
        req.setTitle("Metadata Only Paper");
        req.setAuthors(java.util.List.of("Alice", "Bob"));
        req.setYear(2023);

        Paper result = paperService.importPaper(TEST_USER_ID, TEST_PROJECT_ID, req);

        assertNotNull(result);
        assertEquals("Metadata Only Paper", result.getTitle());
        assertEquals("Alice, Bob", result.getAuthors());
        assertEquals(2023, result.getYear());
        assertEquals("UPLOADED", result.getStatus());
        // 无 PDF → 不发分析 MQ
        verify(crossrefService, never()).resolve(anyString());
        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
    }

    @Test
    void testImportPaper_CrossrefFallback_UseRequestTitle() {
        when(projectService.requireProjectOwnedBy(TEST_PROJECT_ID, TEST_USER_ID))
                .thenReturn(testProject);
        when(userService.requireUser(TEST_USER_ID)).thenReturn(testUser);
        doNothing().when(subscriptionService).checkQuota(TEST_USER_ID, "FREE");
        // Crossref 失败 → empty，回退到请求参数
        when(crossrefService.resolve("10.1234/missing")).thenReturn(Optional.empty());
        when(paperMapper.insert(any(Paper.class))).thenAnswer(invocation -> {
            Paper paper = invocation.getArgument(0);
            paper.setId(202L);
            return 1;
        });

        PaperImportRequest req = new PaperImportRequest();
        req.setDoi("10.1234/missing");
        req.setTitle("Fallback Title");

        Paper result = paperService.importPaper(TEST_USER_ID, TEST_PROJECT_ID, req);

        assertNotNull(result);
        assertEquals("Fallback Title", result.getTitle());
        assertEquals("UPLOADED", result.getStatus());
    }

    @Test
    void testImportPaper_NoTitle_ShouldThrow() {
        when(projectService.requireProjectOwnedBy(TEST_PROJECT_ID, TEST_USER_ID))
                .thenReturn(testProject);
        when(userService.requireUser(TEST_USER_ID)).thenReturn(testUser);
        doNothing().when(subscriptionService).checkQuota(TEST_USER_ID, "FREE");

        PaperImportRequest req = new PaperImportRequest();
        // 无 DOI、无标题 → BAD_REQUEST
        assertThrows(RuntimeException.class, () ->
                paperService.importPaper(TEST_USER_ID, TEST_PROJECT_ID, req)
        );
        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
    }
}
