// Embedding via the unified gateway /v1/embeddings (batch 10, 1s between
// batches, exponential backoff on 429) — mirror ai-service/app/rag/embedding.py.
// 2026-08-20 myf: 支持用户自定义嵌入向量 override（baseUrl/apiKey/model，
// 直连上游；失败自动回退网关默认，与 llm.js 的 chatComplete 模式一致）。
// @module @researchos/dsh-research-ai-worker/lib/embed

import { GATEWAY, EMBED_MODEL } from './config.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function embedOnce(batch, log, override) {
  const maxRetries = 5
  let delay = 2000
  // 2026-08-20 myf: override 直连（绕过网关，类似 llm.js）；无 override 走网关。
  const hasOverride = override && (override.baseUrl || override.apiKey)
  const base = hasOverride && override.baseUrl
    ? String(override.baseUrl).replace(/\/+$/, '')
    : GATEWAY
  const model = hasOverride && override.model ? override.model : EMBED_MODEL
  const headers = hasOverride && override.apiKey
    ? { 'content-type': 'application/json', authorization: `Bearer ${override.apiKey}` }
    : { 'content-type': 'application/json' }
  // 2026-08-21 uaenamyf: 与 llm.js 同理 —— 用户填的 baseUrl 若已含 /v1 则不再
  // 补 /v1，避免 /v1/v1/embeddings → 404 → AI service unavailable。
  const basePath = /\/v1$/i.test(base) ? '' : '/v1'
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${base}${basePath}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: batch, model }),
        signal: AbortSignal.timeout(90000),
      })
      if (!res.ok) {
        // 2026-08-21 uaenamyf: 提取 message（含「暂未配置 Embedding API Key…」中文提示）
        const detail = await res.text().catch(() => '')
        let msg = `embeddings HTTP ${res.status}`
        try {
          const j = JSON.parse(detail)
          if (j?.error?.message) msg = j.error.message
        } catch { /* non-JSON body — keep status-only */ }
        throw new Error(msg)
      }
      const j = await res.json()
      let data = Array.isArray(j.data) ? [...j.data] : []
      if (data.length && typeof data[0].index === 'number') {
        data.sort((a, b) => a.index - b.index)
      }
      const embs = data.map((d) => d.embedding)
      if (embs.length !== batch.length) {
        throw new Error(`embedding count mismatch: got ${embs.length}, want ${batch.length}`)
      }
      return embs
    } catch (e) {
      const isRateLimit = /429|RateLimit|TooManyRequests/i.test(String(e.message))
      if (isRateLimit && attempt < maxRetries) {
        log?.warn?.(`embedding rate-limited, retry in ${delay / 1000}s (${attempt}/${maxRetries})`)
        await sleep(delay)
        delay *= 2
        continue
      }
      throw e
    }
  }
  throw new Error('embedding retries exhausted')
}

export async function embedBatch(texts, log, override) {
  if (!texts.length) return []
  // 2026-08-20 myf: override 直连失败回退网关默认（与 llm.js chatComplete 一致），
  // 保证用户配错自定义 embedding 时分析不中断。
  if (override && (override.baseUrl || override.apiKey)) {
    try {
      return await embedBatchCore(texts, log, override)
    } catch (e) {
      log?.warn?.(`embedding override failed (${e.message}), falling back to gateway`)
      return embedBatchCore(texts, log, undefined)
    }
  }
  return embedBatchCore(texts, log, undefined)
}

async function embedBatchCore(texts, log, override) {
  const BATCH_SIZE = 10
  const results = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    results.push(...(await embedOnce(batch, log, override)))
    if (i + BATCH_SIZE < texts.length) await sleep(1000)
  }
  return results
}
