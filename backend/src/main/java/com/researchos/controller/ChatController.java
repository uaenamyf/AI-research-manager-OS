package com.researchos.controller;

import com.researchos.entity.Conversation;
import com.researchos.service.ChatService;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.common.response.ApiResponse;
import com.researchos.security.CurrentUserResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * Paper Chat 控制器：流式 + 非流式 + 历史。
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@RestController
@RequestMapping("/api/papers/{paperId}/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final CurrentUserResolver currentUserResolver;

    /**
     * 流式问答（SSE）。
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStream(@PathVariable Long paperId,
                                 @RequestParam String q) {
        Long userId = currentUserResolver.requireUserId();
        SseEmitter emitter = new SseEmitter(60_000L);
        chatService.forwardStream(paperId, userId, q, emitter);
        return emitter;
    }

    /**
     * 非流式问答。
     */
    @PostMapping
    public ApiResponse<Conversation> ask(
            @PathVariable Long paperId,
            @RequestBody java.util.Map<String, String> body) {
        Long userId = currentUserResolver.requireUserId();
        String question = body.get("question");
        if (question == null || question.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST);
        }
        // 简化：非流式直接调用流式并聚合（生产环境应调用 ai-service 非流式接口）
        // 此处返回占位，实际由 ai-service 提供非流式端点
        Conversation conv = new Conversation();
        conv.setPaperId(paperId);
        conv.setUserId(userId);
        conv.setQuestion(question);
        conv.setAnswer("（非流式接口待实现）");
        chatService.saveHistory(userId, paperId, question, conv.getAnswer());
        return ApiResponse.ok(conv);
    }

    /**
     * 历史列表。
     */
    @GetMapping("/history")
    public ApiResponse<List<Conversation>> history(
            @PathVariable Long paperId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Long userId = currentUserResolver.requireUserId();
        return ApiResponse.ok(chatService.listHistory(paperId, userId, size));
    }
}
