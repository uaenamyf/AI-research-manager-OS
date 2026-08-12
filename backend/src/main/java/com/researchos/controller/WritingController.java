package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.dto.MachineTranslateRequest;
import com.researchos.dto.WritingRewriteRequest;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.WritingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Writing 控制器：Writing Agent 文本变换（改写/润色/回复审稿人/Cover letter）。
 *
 * @author myf
 * @since 2026-07-26
 */
@RestController
@RequestMapping("/api/writing")
@RequiredArgsConstructor
public class WritingController {

    private final WritingService writingService;
    private final CurrentUserResolver currentUserResolver;

    @PostMapping("/rewrite")
    public ApiResponse<Map<String, String>> rewrite(
            @Valid @RequestBody WritingRewriteRequest req) {
        Long userId = currentUserResolver.requireUserId();
        String text = writingService.rewrite(userId, req);
        return ApiResponse.ok(Map.of("action", req.getAction(), "text", text));
    }

    /**
     * 机器翻译（翻译器，非 LLM）：快速翻译，用于划词翻译 Tab。
     */
    // 2026-08-12 myf: 新增机器翻译端点
    @PostMapping("/translate-machine")
    public ApiResponse<Map<String, String>> translateMachine(
            @Valid @RequestBody MachineTranslateRequest req) {
        Long userId = currentUserResolver.requireUserId();
        WritingService.TranslateResult result =
                writingService.translateMachine(userId, req.getText(), req.getTargetLang());
        Map<String, String> data = new LinkedHashMap<>();
        data.put("text", result.text());
        data.put("sourceLang", result.sourceLang());
        data.put("targetLang", result.targetLang());
        return ApiResponse.ok(data);
    }
}
