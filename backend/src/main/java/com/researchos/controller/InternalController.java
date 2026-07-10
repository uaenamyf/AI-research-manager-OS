package com.researchos.controller;

import com.researchos.service.AiTaskService;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.common.response.ApiResponse;
import com.researchos.config.AppProperties;
import com.researchos.service.PaperService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 内部回调端点：接收 ai-service 的结果回传。
 * 用 X-Internal-Token 校验，不对外暴露。
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@RestController
@RequestMapping("/internal")
@RequiredArgsConstructor
public class InternalController {

    private final AiTaskService aiTaskService;
    private final PaperService paperService;
    private final AppProperties appProperties;

    /**
     * 校验内部 token。
     */
    private void verifyToken(String token) {
        if (token == null || !token.equals(appProperties.getAiService().getInternalToken())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
    }

    /**
     * 论文分析结果回传。
     */
    @PatchMapping("/paper/{id}/result")
    public ApiResponse<Void> paperResult(
            @PathVariable Long id,
            @RequestHeader("X-Internal-Token") String token,
            @RequestBody Map<String, Object> body) {
        verifyToken(token);
        log.info("收到论文分析回调：paperId={}, body keys={}", id, body.keySet());
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> summary = (Map<String, Object>) body.get("summary");
            String status = (String) body.getOrDefault("status", "READY");
            paperService.updateAnalysisResult(id, summary, status);
            log.info("论文分析回调成功：paperId={}, status={}", id, status);
            return ApiResponse.ok();
        } catch (Exception e) {
            log.error("论文分析回调失败：paperId={}", id, e);
            throw e;
        }
    }

    /**
     * 任务结果回传（综述等）。
     */
    @PatchMapping("/task/{id}/result")
    public ApiResponse<Void> taskResult(
            @PathVariable Long id,
            @RequestHeader("X-Internal-Token") String token,
            @RequestBody Map<String, Object> body) {
        verifyToken(token);
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) body.get("result");
        String status = (String) body.getOrDefault("status", "SUCCESS");
        String error = (String) body.get("error");
        aiTaskService.updateTaskResult(id, result, status, error);
        return ApiResponse.ok();
    }
}
