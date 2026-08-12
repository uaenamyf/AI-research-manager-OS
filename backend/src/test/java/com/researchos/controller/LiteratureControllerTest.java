package com.researchos.controller;

import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.common.exception.GlobalExceptionHandler;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.LiteratureService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * LiteratureController MockMvc 测试：验证鉴权、参数映射与统一响应体。
 */
class LiteratureControllerTest {

    private final LiteratureService literatureService = Mockito.mock(LiteratureService.class);
    private final CurrentUserResolver currentUserResolver =
            Mockito.mock(CurrentUserResolver.class);

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        LiteratureController controller =
                new LiteratureController(literatureService, currentUserResolver);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void search_returnsUnifiedResponseOnSuccess() throws Exception {
        when(currentUserResolver.requireUserId()).thenReturn(42L);
        when(literatureService.search(eq("transformer"), eq(5), isNull(), isNull(),
                isNull(), isNull())).thenReturn(Map.of("returned", 5));

        mockMvc.perform(get("/api/literature/search")
                        .param("query", "transformer")
                        .param("limit", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.returned").value(5));

        verify(literatureService).search(eq("transformer"), eq(5), isNull(), isNull(),
                isNull(), isNull());
    }

    @Test
    void search_mapsQueryParams() throws Exception {
        when(currentUserResolver.requireUserId()).thenReturn(42L);
        when(literatureService.search(any(), any(), any(), any(), any(), any()))
                .thenReturn(Map.of());

        mockMvc.perform(get("/api/literature/search")
                        .param("query", "attention")
                        .param("sources", "pubmed,arxiv")
                        .param("year_from", "2020")
                        .param("year_to", "2024")
                        .param("open_access", "true"))
                .andExpect(status().isOk());

        verify(literatureService).search(
                eq("attention"), eq(10), eq(List.of("pubmed", "arxiv")),
                eq(2020), eq(2024), eq(true));
    }

    @Test
    void search_returnsUnauthorizedWhenNotLoggedIn() throws Exception {
        when(currentUserResolver.requireUserId())
                .thenThrow(new BusinessException(ErrorCode.UNAUTHORIZED));

        mockMvc.perform(get("/api/literature/search").param("query", "x"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(ErrorCode.UNAUTHORIZED.getCode()));
    }

    @Test
    void sources_returnsUnifiedResponse() throws Exception {
        when(currentUserResolver.requireUserId()).thenReturn(42L);
        when(literatureService.sources()).thenReturn(Map.of("count", 7));

        mockMvc.perform(get("/api/literature/sources"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.count").value(7));

        verify(literatureService).sources();
    }
}
