package com.researchos.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.config.AppProperties;
import com.researchos.entity.Conversation;
import com.researchos.entity.Paper;
import com.researchos.service.impl.ChatServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.ByteArrayInputStream;
import java.lang.reflect.Field;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * 聊天服务单元测试：验证 SSE 流结束后落库、error 事件不落库。
 *
 * @author myf
 * @since 2026-07-23
 */
@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock
    private PaperService paperService;

    @Mock
    private AppProperties appProperties;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @Spy
    @InjectMocks
    private ChatServiceImpl chatService;

    private static final Long TEST_USER_ID = 1L;
    private static final Long TEST_PAPER_ID = 10L;

    private Paper readyPaper() {
        Paper paper = new Paper();
        paper.setId(TEST_PAPER_ID);
        paper.setStatus("READY");
        return paper;
    }

    private void stubAiProperties() {
        AppProperties.AiService ai = new AppProperties.AiService();
        ai.setBaseUrl("http://localhost:8000");
        ai.setInternalToken("test-token");
        when(appProperties.getAiService()).thenReturn(ai);
    }

    /** 通过反射替换 httpClient，避免真实网络请求。 */
    private void stubHttpClient(HttpClient fake) throws Exception {
        Field f = ChatServiceImpl.class.getDeclaredField("httpClient");
        f.setAccessible(true);
        f.set(chatService, fake);
    }

    private HttpClient fakeHttpClient(String sse) throws Exception {
        HttpResponse<ByteArrayInputStream> resp = mock(HttpResponse.class);
        when(resp.body()).thenReturn(
                new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)));
        HttpClient fake = mock(HttpClient.class);
        // doReturn 避免 sendAsync 泛型推断问题
        doReturn(CompletableFuture.completedFuture(resp))
                .when(fake)
                .sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        return fake;
    }

    /** mock emitter：真实 SseEmitter 无 handler，send 会抛异常。 */
    private SseEmitter mockEmitter() throws java.io.IOException {
        SseEmitter emitter = mock(SseEmitter.class);
        doNothing().when(emitter).send(any(SseEmitter.SseEventBuilder.class));
        return emitter;
    }

    @Test
    void forwardStream_savesHistoryOnDone() throws Exception {
        when(paperService.requirePaperOwnedBy(TEST_PAPER_ID, TEST_USER_ID))
                .thenReturn(readyPaper());
        stubAiProperties();
        // saveHistory 内部 save() 依赖 baseMapper（未注入），stub 掉避免 NPE
        doReturn(true).when(chatService).save(any(Conversation.class));

        // 模拟 ai-service SSE 流：citation -> token -> done
        String sse = "data: {\"type\":\"citation\",\"citations\":[1,2]}\n\n"
                + "data: {\"type\":\"token\",\"content\":\"Hel\"}\n\n"
                + "data: {\"type\":\"token\",\"content\":\"lo\"}\n\n"
                + "data: {\"type\":\"done\"}\n\n";
        stubHttpClient(fakeHttpClient(sse));

        chatService.forwardStream(TEST_PAPER_ID, TEST_USER_ID, "hi",
                mockEmitter());

        // timeout 等待异步转发完成并落库
        verify(chatService, timeout(3000)).saveHistory(
                eq(TEST_USER_ID), eq(TEST_PAPER_ID), eq("hi"), eq("Hello"));
    }

    @Test
    void forwardStream_doesNotSaveOnError() throws Exception {
        when(paperService.requirePaperOwnedBy(TEST_PAPER_ID, TEST_USER_ID))
                .thenReturn(readyPaper());
        stubAiProperties();

        // 只有 error 事件，无 done：不应落库
        String sse = "data: {\"type\":\"error\",\"message\":\"boom\"}\n\n";
        stubHttpClient(fakeHttpClient(sse));

        chatService.forwardStream(TEST_PAPER_ID, TEST_USER_ID, "hi",
                mockEmitter());

        // 等待异步处理完成后断言未调用
        Thread.sleep(1000);
        verify(chatService, never())
                .saveHistory(anyLong(), anyLong(), anyString(), anyString());
    }

    @Test
    void forwardStream_paperNotReady_throws() {
        Paper paper = new Paper();
        paper.setId(TEST_PAPER_ID);
        paper.setStatus("FAILED");
        when(paperService.requirePaperOwnedBy(TEST_PAPER_ID, TEST_USER_ID))
                .thenReturn(paper);

        assertThrows(BusinessException.class,
                () -> chatService.forwardStream(TEST_PAPER_ID, TEST_USER_ID, "hi",
                        new SseEmitter()));
    }
}
