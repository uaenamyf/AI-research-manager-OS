package com.researchos.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.researchos.entity.Conversation;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * Paper Chat 服务：转发 ai-service 的 SSE 流。
 *
 * @author myf
 * @since 2026-07-08
 */
public interface ChatService extends IService<Conversation> {

    /**
     * 流式问答：转发 ai-service 的 SSE 流到前端。
     */
    void forwardStream(Long paperId, Long userId, String question, SseEmitter emitter);

    /**
     * 保存聊天记录。
     */
    void saveHistory(Long userId, Long paperId, String question, String answer);

    /**
     * 历史列表。
     */
    List<Conversation> listHistory(Long paperId, Long userId, int limit);
}
