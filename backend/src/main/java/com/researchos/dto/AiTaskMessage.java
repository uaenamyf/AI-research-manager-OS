package com.researchos.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * AI 任务 MQ 消息体。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@AllArgsConstructor
public class AiTaskMessage {
    private Long taskId;
    private String type;
    private java.util.Map<String, Object> payload;
}
