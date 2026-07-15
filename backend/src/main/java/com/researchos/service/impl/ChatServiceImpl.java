package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.entity.Conversation;
import com.researchos.entity.Paper;
import com.researchos.mapper.ConversationMapper;
import com.researchos.service.ChatService;
import com.researchos.service.PaperService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

/**
 * Paper Chat 服务实现：转发 ai-service 的 SSE 流。
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatServiceImpl extends ServiceImpl<ConversationMapper, Conversation> implements ChatService {

    private final PaperService paperService;
    private final AppProperties appProperties;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    /**
     * 流式问答：转发 ai-service 的 SSE 流到前端。
     */
    @Override
    public void forwardStream(Long paperId, Long userId, String question,
                              SseEmitter emitter) {
        // 校验论文归属与状态
        Paper paper = paperService.requirePaperOwnedBy(paperId, userId);
        if (!"READY".equals(paper.getStatus()) && !"ANALYZED".equals(paper.getStatus())) {
            throw new BusinessException(ErrorCode.PAPER_NOT_READY);
        }

        try {
            String aiUrl = appProperties.getAiService().getBaseUrl()
                    + "/rag/chat/stream";
            String body = "{\"paperId\":" + paperId + ",\"question\":\"" +
                    question.replace("\"", "\\\"") + "\"}";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(aiUrl))
                    .header("Content-Type", "application/json")
                    .header("X-Internal-Token",
                            appProperties.getAiService().getInternalToken())
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream())
                    .thenAccept(response -> {
                        try (BufferedReader reader = new BufferedReader(
                                new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                            String line;
                            while ((line = reader.readLine()) != null) {
                                if (line.startsWith("data:")) {
                                    String data = line.substring(5).trim();
                                    emitter.send(SseEmitter.event().data(data));
                                }
                            }
                            emitter.complete();
                        } catch (Exception e) {
                            log.error("SSE 转发失败", e);
                            emitter.completeWithError(e);
                        }
                    })
                    .exceptionally(e -> {
                        log.error("调用 ai-service 失败", e);
                        emitter.completeWithError(e);
                        return null;
                    });
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    /**
     * 保存聊天记录。
     */
    @Override
    public void saveHistory(Long userId, Long paperId, String question, String answer) {
        Conversation conv = new Conversation();
        conv.setUserId(userId);
        conv.setPaperId(paperId);
        conv.setQuestion(question);
        conv.setAnswer(answer);
        save(conv);
    }

    /**
     * 历史列表。
     */
    @Override
    public List<Conversation> listHistory(Long paperId, Long userId, int limit) {
        return list(new LambdaQueryWrapper<Conversation>()
                .eq(Conversation::getPaperId, paperId)
                .eq(Conversation::getUserId, userId)
                .orderByDesc(Conversation::getCreatedTime)
                .last("LIMIT " + limit));
    }
}
