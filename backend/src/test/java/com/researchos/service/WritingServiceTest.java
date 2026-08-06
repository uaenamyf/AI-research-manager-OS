package com.researchos.service;

import com.researchos.common.exception.BusinessException;
import com.researchos.config.AppProperties;
import com.researchos.dto.WritingTransformRequest;
import com.researchos.dto.WritingTransformResult;
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
    @SuppressWarnings("unchecked")
    void testTransform_ReturnsResult() throws Exception {
        stubAiProperties();
        HttpClient fake = (HttpClient) ReflectionTestUtils.getField(writingService, "httpClient");
        String json = "{\"result\":\"Polished academic text.\"}";
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(json);
        // HttpClient.send 是泛型方法，用 doReturn 避免泛型推断不匹配
        doReturn(response).when(fake)
                .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));

        WritingTransformResult result = writingService.transform(
                new WritingTransformRequest("this is a draft", "polish"));

        assertNotNull(result);
        assertEquals("Polished academic text.", result.getResult());
        // 校验请求 URL 与 token
        verify(fake).send(argThat(req ->
                req.uri().toString().equals("http://localhost:8000/writing/transform")
                        && req.headers().firstValue("X-Internal-Token").orElse("").equals("test-token")
        ), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void testTransform_ThrowsWhenAiUnavailable() throws Exception {
        stubAiProperties();
        HttpClient fake = (HttpClient) ReflectionTestUtils.getField(writingService, "httpClient");
        doThrow(new IOException("connection refused")).when(fake)
                .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));

        assertThrows(BusinessException.class, () -> writingService.transform(
                new WritingTransformRequest("text", "polish")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void testTransform_ThrowsOnNon200() throws Exception {
        stubAiProperties();
        HttpClient fake = (HttpClient) ReflectionTestUtils.getField(writingService, "httpClient");
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(500);
        doReturn(response).when(fake)
                .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));

        assertThrows(BusinessException.class, () -> writingService.transform(
                new WritingTransformRequest("text", "rewrite")));
    }
}
