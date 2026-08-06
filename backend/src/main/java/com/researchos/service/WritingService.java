package com.researchos.service;

import com.researchos.dto.WritingTransformRequest;
import com.researchos.dto.WritingTransformResult;

/**
 * Writing Agent 服务：调用 ai-service 做文本变换。
 *
 * @author myf
 * @since 2026-08-06
 */
public interface WritingService {

    /**
     * 文本变换（改写/润色/回复审稿人/Cover letter）。
     *
     * @param req 变换请求（text + action）
     * @return 变换结果
     */
    WritingTransformResult transform(WritingTransformRequest req);
}
