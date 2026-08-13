package com.researchos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.researchos.common.exception.BusinessException;
import com.researchos.dto.ProjectCreateRequest;
import com.researchos.entity.ResearchProject;
import com.researchos.mapper.ProjectMapper;
import com.researchos.service.impl.ProjectServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 项目服务单元测试。
 *
 * @author myf
 * @since 2026-07-23
 */
@ExtendWith(MockitoExtension.class)
class ProjectServiceTest {

    @Mock
    private ProjectMapper projectMapper;

    @InjectMocks
    private ProjectServiceImpl projectService;

    private static final Long TEST_USER_ID = 1L;

    private ResearchProject testProject1;
    private ResearchProject testProject2;

    @BeforeEach
    void setUp() {
        // 手动注入 baseMapper（MyBatis Plus ServiceImpl 持有，@InjectMocks 按类型注入有歧义）
        ReflectionTestUtils.setField(projectService, "baseMapper", projectMapper);

        testProject1 = new ResearchProject();
        testProject1.setId(1L);
        testProject1.setUserId(TEST_USER_ID);
        testProject1.setName("AI Research Project");
        testProject1.setDomain("Machine Learning");
        testProject1.setCreatedTime(LocalDateTime.now());

        testProject2 = new ResearchProject();
        testProject2.setId(2L);
        testProject2.setUserId(TEST_USER_ID);
        testProject2.setName("NLP Paper Reading");
        testProject2.setDomain("Natural Language Processing");
        testProject2.setCreatedTime(LocalDateTime.now());
    }

    @Test
    void testCreateProject_Success() {
        when(projectMapper.insert(any(ResearchProject.class))).thenAnswer(invocation -> {
            ResearchProject project = invocation.getArgument(0);
            project.setId(1L);
            return 1;
        });

        ProjectCreateRequest req = new ProjectCreateRequest();
        req.setName("New Project");
        req.setDomain("AI Research");

        ResearchProject result = projectService.create(TEST_USER_ID, req);

        assertNotNull(result);
        assertEquals(1L, result.getId());
        assertEquals("New Project", result.getName());
        assertEquals("AI Research", result.getDomain());
        assertEquals(TEST_USER_ID, result.getUserId());
    }

    @Test
    void testListByUser_Success() {
        // 模拟分页查询
        Page<ResearchProject> pageResult = new Page<>();
        pageResult.setRecords(Arrays.asList(testProject1, testProject2));
        pageResult.setTotal(2);
        pageResult.setCurrent(0);
        pageResult.setSize(10);

        when(projectMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class)))
                .thenReturn(pageResult);

        var result = projectService.list(TEST_USER_ID, 0, 10);

        assertNotNull(result);
        assertEquals(2, result.total());
        assertEquals(0, result.page());
        assertEquals(10, result.size());
    }

    @Test
    void testList_EmptyResult() {
        Page<ResearchProject> pageResult = new Page<>();
        pageResult.setRecords(Arrays.asList());
        pageResult.setTotal(0);

        when(projectMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class)))
                .thenReturn(pageResult);

        var result = projectService.list(TEST_USER_ID, 0, 10);

        assertNotNull(result);
        assertEquals(0, result.total());
    }

    @Test
    void testRequireProjectOwnedBy_Success() {
        when(projectMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(testProject1);

        ResearchProject result = projectService.requireProjectOwnedBy(1L, TEST_USER_ID);

        assertNotNull(result);
        assertEquals(1L, result.getId());
        assertEquals("AI Research Project", result.getName());
    }

    @Test
    void testRequireProjectOwnedBy_NotFound_ShouldThrow() {
        when(projectMapper.selectOne(any(LambdaQueryWrapper.class), anyBoolean()))
                .thenReturn(null);

        assertThrows(BusinessException.class, () ->
                projectService.requireProjectOwnedBy(999L, TEST_USER_ID)
        );
    }

    // 注意：ProjectService 没有公开的 deleteProject 方法
    // 删除操作通过 MyBatis-Plus 的 removeById 直接调用，如果需要请在 service 层添加方法
}
