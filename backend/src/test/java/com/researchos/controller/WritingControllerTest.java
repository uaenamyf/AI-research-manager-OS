package com.researchos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.common.exception.GlobalExceptionHandler;
import com.researchos.dto.WritingRewriteRequest;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.WritingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WritingController MockMvc 测试：验证鉴权、参数校验与统一响应体。
 */
class WritingControllerTest {

    private final WritingService writingService = Mockito.mock(WritingService.class);
    private final CurrentUserResolver currentUserResolver =
            Mockito.mock(CurrentUserResolver.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        WritingController controller =
                new WritingController(writingService, currentUserResolver);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private String json(String text, String action) throws Exception {
        WritingRewriteRequest req = new WritingRewriteRequest();
        req.setText(text);
        req.setAction(action);
        return objectMapper.writeValueAsString(req);
    }

    @Test
    void rewrite_returnsUnifiedResponseOnSuccess() throws Exception {
        when(currentUserResolver.requireUserId()).thenReturn(42L);
        when(writingService.rewrite(eq(42L), any())).thenReturn("polished text");

        mockMvc.perform(post("/api/writing/rewrite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("draft", "polish")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.action").value("polish"))
                .andExpect(jsonPath("$.data.text").value("polished text"));

        verify(writingService).rewrite(eq(42L), any(WritingRewriteRequest.class));
    }

    @Test
    void rewrite_returnsBadRequestWhenTextBlank() throws Exception {
        when(currentUserResolver.requireUserId()).thenReturn(42L);

        mockMvc.perform(post("/api/writing/rewrite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("", "polish")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(ErrorCode.BAD_REQUEST.getCode()));
    }

    @Test
    void rewrite_returnsBadRequestWhenActionBlank() throws Exception {
        when(currentUserResolver.requireUserId()).thenReturn(42L);

        mockMvc.perform(post("/api/writing/rewrite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("draft", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(ErrorCode.BAD_REQUEST.getCode()));
    }

    @Test
    void rewrite_returnsUnauthorizedWhenNotLoggedIn() throws Exception {
        when(currentUserResolver.requireUserId())
                .thenThrow(new BusinessException(ErrorCode.UNAUTHORIZED));

        mockMvc.perform(post("/api/writing/rewrite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("draft", "polish")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(ErrorCode.UNAUTHORIZED.getCode()));
    }

    @Test
    void rewrite_propagatesAiServiceError() throws Exception {
        when(currentUserResolver.requireUserId()).thenReturn(42L);
        when(writingService.rewrite(eq(42L), any()))
                .thenThrow(new BusinessException(ErrorCode.AI_SERVICE_ERROR));

        mockMvc.perform(post("/api/writing/rewrite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("draft", "polish")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(ErrorCode.AI_SERVICE_ERROR.getCode()));
    }
}
