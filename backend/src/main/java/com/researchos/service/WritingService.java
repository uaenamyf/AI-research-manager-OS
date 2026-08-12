package com.researchos.service;

import com.researchos.dto.WritingRewriteRequest;

/**
 * Writing Agent 服务：调用 ai-service 做文本改写。
 *
 * @author myf
 * @since 2026-07-26
 */
public interface WritingService {

    /**
     * 同步改写文本，返回改写后的结果文本。
     *
     * @param userId 当前用户（用于额度/审计，ai-service 不落库）
     * @param req    改写请求（text + action + instruction）
     * @return 改写后的文本
     */
    String rewrite(Long userId, WritingRewriteRequest req);

    /**
     * 机器翻译（翻译器，非 LLM）：代理到免费翻译服务。
     *
     * <p>与 {@link #rewrite} 的 translate action 互补：机器翻译快、无额度消耗，
     * 大模型翻译质量更高。由前端按用户选择路由。</p>
     *
     * @param userId     当前用户（用于审计）
     * @param text       待翻译文本
     * @param targetLang 目标语言代码（Google 风格，如 zh-CN / en / ja）
     * @return 翻译结果（含译文与检测到的源语言）
     */
    TranslateResult translateMachine(Long userId, String text, String targetLang);

    /** 机器翻译结果值对象。 */
    record TranslateResult(String text, String sourceLang, String targetLang) {
    }
}
