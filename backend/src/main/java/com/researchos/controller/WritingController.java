package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.dto.WritingTransformRequest;
import com.researchos.dto.WritingTransformResult;
import com.researchos.service.WritingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Writing 控制器：Writing Agent 文本变换（改写/润色/回复审稿人/Cover letter）。
 *
 * @author myf
 * @since 2026-08-06
 */
@RestController
@RequestMapping("/api/writing")
@RequiredArgsConstructor
public class WritingController {

    private final WritingService writingService;

    @PostMapping("/transform")
    public ApiResponse<WritingTransformResult> transform(
            @Valid @RequestBody WritingTransformRequest req) {
        return ApiResponse.ok(writingService.transform(req));
    }
}
