package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.dto.WritingRewriteRequest;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.WritingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Writing 控制器：科研文本改写 / 润色。
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
}
