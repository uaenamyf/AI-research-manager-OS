// Phase 1 LLM gateway: OpenAI-compatible proxy to a configurable upstream,
// serving as the UNIFIED LLM/Embedding API entry (requirement 3). Both
// ResearchOS ai-service and (optionally) dsh's own adapters point their
// base_url at this gateway; keys/models live here in one place.
//
//   POST /v1/chat/completions  -> upstream chat (JSON or SSE stream passthrough)
//   POST /v1/embeddings        -> upstream embeddings
//
// Config via env (set in the dsh launch environment):
//   RESEARCH_LLM_BASE_URL, RESEARCH_LLM_API_KEY, RESEARCH_LLM_MODEL
//   RESEARCH_EMBEDDING_BASE_URL (fallback LLM base), RESEARCH_EMBEDDING_API_KEY (fallback LLM key)
//   RESEARCH_GATEWAY_RPM        (per-client rate limit, req/min; 0 = unlimited, default 120)
// @module @researchos/dsh-llm-gateway

import { StringDecoder } from 'node:string_decoder'

export const name = 'research-llm-gateway'

export const inject = ['webServer']

const LLM_BASE = process.env.RESEARCH_LLM_BASE_URL || 'https://ark.cn-beijing.volces.com'
const LLM_KEY = process.env.RESEARCH_LLM_API_KEY || process.env.OPENAI_API_KEY || ''
const LLM_MODEL = process.env.RESEARCH_LLM_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'ark-code-latest'
const EMB_BASE = process.env.RESEARCH_EMBEDDING_BASE_URL || LLM_BASE
const EMB_KEY = process.env.RESEARCH_EMBEDDING_API_KEY || LLM_KEY
const EMB_MODEL = process.env.RESEARCH_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'

// ── rate limiting (per-key token bucket; 0 = unlimited) ────────────────────
// 2026-08-18 uaenamyf: Phase 1 遗留「网关限流」落地。按调用方身份（Authorization /
// X-API-Key 头，缺省回退客户端 IP）做每客户端滑动窗口限流，防止单方打爆上游配额。
const RPM = Number(process.env.RESEARCH_GATEWAY_RPM || 120)
const buckets = new Map() // key -> { tokens, ts }
const WINDOW_MS = 60000

function clientKey(req) {
  const auth = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (m) return `k:${m[1].trim()}`
  const apiKey = req.headers['x-api-key']
  if (apiKey) return `k:${String(apiKey).trim()}`
  return `ip:${req.socket?.remoteAddress || 'unknown'}`
}

function rateLimited(key) {
  if (!RPM) return false
  const now = Date.now()
  let b = buckets.get(key)
  if (!b) {
    b = { tokens: RPM, ts: now }
    buckets.set(key, b)
  }
  b.tokens = Math.min(RPM, b.tokens + ((now - b.ts) / WINDOW_MS) * RPM)
  b.ts = now
  if (b.tokens < 1) return true
  b.tokens -= 1
  return false
}

const pruneTimer = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 2
  for (const [k, b] of buckets) {
    if (b.ts < cutoff) buckets.delete(k)
  }
}, WINDOW_MS).unref?.() ?? null

function readJson(req) {
  return new Promise((resolve, reject) => {
    // 2026-08-20 myf: 修复请求体 UTF-8 截断乱码（Paper Card 摘要出现 U+FFFD �）。
    // 旧实现 `body += c`（Buffer 隐式 toString）会逐 chunk 独立解码：HTTP 分块
    // 边界一旦切断多字节 UTF-8 字符（如 em dash — 占 3 字节），每个不完整的
    // 字节序列都被解码成 U+FFFD 再拼进 body，含乱码的 JSON 随后发给上游 LLM，
    // 模型输出就会带 �。改为先累积 Buffer，再统一 decode，字节完整无损。
    const parts = []
    req.on('data', (c) => parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => {
      try {
        resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function json(res, status, obj, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...extraHeaders })
  res.end(JSON.stringify(obj))
}

function tooMany(req, res) {
  req.resume() // drain the request body so the socket stays reusable
  json(
    res,
    429,
    {
      error: {
        message: `rate limit exceeded (${RPM} req/min). Retry after a short pause.`,
        type: 'rate_limit_error',
      },
    },
    { 'retry-after': '5' },
  )
}

/** Relay an upstream Response to the client (preserves SSE streaming). */
async function relay(res, upstream) {
  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
  })
  const reader = upstream.body?.getReader()
  if (!reader) return res.end()
  // 2026-08-20 myf: 修复 UTF-8 截断乱码（Paper Card 摘要出现 U+FFFD �）。
  // 上游（公网 LLM API）分块传输的 chunk 边界可能恰好切断多字节 UTF-8 字符
  // （如 em dash — / 乘法符号 × 各占 3 字节），之前逐 chunk res.write(Buffer)
  // 会把截断的字节原样写出，客户端 JSON.parse 时非法字节被替换成 U+FFFD，
  // 表现为卡片内容随机出现 �。StringDecoder 会跨 chunk 缓冲未完成的多字节
  // 字符，重组完整后再输出，JSON 与 SSE 流均安全。
  const decoder = new StringDecoder('utf8')
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(decoder.write(value))
    }
    res.write(decoder.end())
  } finally {
    res.end()
  }
}

/** Inject the gateway default model when the request omits it. */
function withModel(body, fallback) {
  if (body.model && typeof body.model === 'string') return body
  return { ...body, model: fallback }
}

export function apply(ctx) {
  ctx.logger.info(
    `[research-llm-gateway] loaded — unified LLM/Embedding API (chat=${LLM_BASE}, embed=${EMB_BASE})`,
  )

  ctx.webServer.register({
    kind: 'exact',
    path: '/v1/chat/completions',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        return json(res, 405, { error: { message: 'method not allowed', type: 'invalid_request_error' } })
      }
      if (rateLimited(clientKey(req))) return tooMany(req, res)
      let body
      try {
        body = withModel(await readJson(req), LLM_MODEL)
      } catch {
        return json(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } })
      }
      try {
        const upstream = await fetch(`${LLM_BASE}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${LLM_KEY}` },
          body: JSON.stringify(body),
        })
        return relay(res, upstream)
      } catch (e) {
        ctx.logger.warn(`[research-llm-gateway] chat upstream error: ${e.message}`)
        return json(res, 502, {
          error: { message: `upstream LLM call failed: ${e.message}`, type: 'upstream_error' },
        })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/v1/embeddings',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        return json(res, 405, { error: { message: 'method not allowed', type: 'invalid_request_error' } })
      }
      if (rateLimited(clientKey(req))) return tooMany(req, res)
      let body
      try {
        body = withModel(await readJson(req), EMB_MODEL)
      } catch {
        return json(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } })
      }
      try {
        const upstream = await fetch(`${EMB_BASE}/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${EMB_KEY}` },
          body: JSON.stringify(body),
        })
        return relay(res, upstream)
      } catch (e) {
        ctx.logger.warn(`[research-llm-gateway] embeddings upstream error: ${e.message}`)
        return json(res, 502, {
          error: { message: `upstream embeddings call failed: ${e.message}`, type: 'upstream_error' },
        })
      }
    },
  })

  ctx.on?.('dispose', () => {
    if (pruneTimer) clearInterval(pruneTimer)
  })
}

export default { name, inject, apply }
