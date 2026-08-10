package com.researchos.service;

import com.researchos.common.exception.BusinessException;
import com.researchos.config.AppProperties;
import com.researchos.dto.WritingRewriteRequest;
import com.researchos.service.impl.WritingServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Writing Agent 服务单元测试。
 *
 * @author myf
 * @since 2026-08-06
 */
@ExtendWith(MockitoExtension.class)
class WritingServiceTest {

    @Mock
    private AppProperties appProperties;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private WritingServiceImpl writingService;

    @BeforeEach
    void setUp() {
        writingService = new WritingServiceImpl(appProperties, objectMapper);
        // 反射替换 httpClient，避免真实网络请求
        ReflectionTestUtils.setField(writingService, "httpClient", mock(HttpClient.class));
    }

    private void stubAiProperties() {
        AppProperties.AiService ai = new AppProperties.AiService();
        ai.setBaseUrl("http://localhost:8000");
        ai.setInternalToken("test-token");
        when(appProperties.getAiService()).thenReturn(ai);
    }

    @Test
    void testRewrite_ThrowsWhenAiUnavailable() throws Exception {
        stubAiProperties();
        HttpClient fake = (HttpClient) ReflectionTestUtils.getField(writingService, "httpClient");
        doThrow(new IOException("connection refused")).when(fake)
                .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));

        assertThrows(BusinessException.class, () -> writingService.rewrite(
                1L, new WritingRewriteRequest("text", "polish", "")));
    }
}
