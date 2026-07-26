package com.researchos.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.dto.WritingRewriteRequest;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * WritingServiceImpl 单元测试：用 JDK HttpServer 桩模拟 ai-service，
 * 验证同步 HTTP 调用、请求头、响应解析与错误映射。
 */
class WritingServiceImplTest {

    private HttpServer server;
    private WritingServiceImpl service;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicReference<String> receivedBody = new AtomicReference<>();
    private final AtomicReference<String> receivedToken = new AtomicReference<>();
    private final AtomicReference<String> receivedPath = new AtomicReference<>();

    private int statusToReturn = 200;
    private String bodyToReturn = "{\"action\":\"polish\",\"text\":\"polished\"}";

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/writing/rewrite", exchange -> {
            receivedPath.set(exchange.getRequestURI().getPath());
            receivedToken.set(exchange.getRequestHeaders().getFirst("X-Internal-Token"));
            receivedBody.set(new String(
                    exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = bodyToReturn.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(statusToReturn, out.length);
            exchange.getResponseBody().write(out);
            exchange.close();
        });
        server.start();

        AppProperties props = new AppProperties();
        props.getAiService().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        props.getAiService().setInternalToken("test-internal-token");
        service = new WritingServiceImpl(props, objectMapper);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void rewrite_returnsTextAndSendsInternalToken() {
        WritingRewriteRequest req = new WritingRewriteRequest();
        req.setText("hello");
        req.setAction("polish");

        String result = service.rewrite(1L, req);

        assertThat(result).isEqualTo("polished");
        assertThat(receivedPath.get()).isEqualTo("/writing/rewrite");
        assertThat(receivedToken.get()).isEqualTo("test-internal-token");
        assertThat(receivedBody.get()).contains("\"text\":\"hello\"");
        assertThat(receivedBody.get()).contains("\"action\":\"polish\"");
    }

    @Test
    void rewrite_normalizesNullInstructionToEmptyString() {
        WritingRewriteRequest req = new WritingRewriteRequest();
        req.setText("hi");
        req.setAction("polish");
        req.setInstruction(null);

        service.rewrite(1L, req);

        assertThat(receivedBody.get()).contains("\"instruction\":\"\"");
    }

    @Test
    void rewrite_returnsEmptyStringWhenTextFieldMissing() {
        bodyToReturn = "{\"action\":\"polish\"}";
        WritingRewriteRequest req = new WritingRewriteRequest();
        req.setText("hi");
        req.setAction("polish");

        assertThat(service.rewrite(1L, req)).isEmpty();
    }

    @Test
    void rewrite_mapsNon200ToAiServiceError() {
        statusToReturn = 500;
        bodyToReturn = "boom";
        WritingRewriteRequest req = new WritingRewriteRequest();
        req.setText("hi");
        req.setAction("polish");

        assertThatThrownBy(() -> service.rewrite(1L, req))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode())
                        .isEqualTo(ErrorCode.AI_SERVICE_ERROR.getCode()));
    }

    @Test
    void rewrite_mapsConnectionFailureToAiServiceError() {
        server.stop(0);
        WritingRewriteRequest req = new WritingRewriteRequest();
        req.setText("hi");
        req.setAction("polish");

        assertThatThrownBy(() -> service.rewrite(1L, req))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode())
                        .isEqualTo(ErrorCode.AI_SERVICE_ERROR.getCode()));
    }
}
