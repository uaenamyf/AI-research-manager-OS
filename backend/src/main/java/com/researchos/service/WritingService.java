package com.researchos.service;

import com.researchos.dto.WritingRewriteRequest;
import com.researchos.dto.WritingTransformRequest;
import com.researchos.dto.WritingTransformResult;

/**
 * Writing Agent 服务：调用 ai-service 做文本变换。
 *
 * @author myf
 * @since 2026-07-26
 */
public interface WritingService {

    /**
     * 文本变换（改写/润色/回复审稿人/Cover letter）。
     *
     * @param req 变换请求（text + action）
     * @return 变换结果
     */
    WritingTransformResult transform(WritingTransformRequest req);

    /**
     * 同步改写文本，返回改写后的结果文本。
     *
     * @param userId 当前用户（用于额度/审计，ai-service 不落库）
     * @param req    改写请求（text + action + instruction）
     * @return 改写后的文本
     */
    String rewrite(Long userId, WritingRewriteRequest req);
}
