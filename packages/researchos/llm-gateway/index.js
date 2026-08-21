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

// 2026-08-21 uaenamyf: 网关 key/base 在 apply() 时从 DSH settings/credentials 文件
// 动态加载（不在模块加载期读 process.env）。原因：用户经 UI 保存配置后写
// ~/.dsh/settings.yaml + .credentials.yaml；启动期 env 为空，请求时才读得到。
// 同样支持 env 覆盖（CI / 外部部署场景）。
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const SETTINGS_FILE = join(DSH_HOME, 'settings.yaml')
const CREDS_FILE = join(DSH_HOME, '.credentials.yaml')

function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) return {}
  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf8')
    const m = raw.match(/^research:\n((?:  [^\n]+\n|\n)*)/m)
    if (!m) return {}
    const block = m[1]
    const out = { llm: {}, embedding: {} }
    for (const sec of ['llm', 'embedding']) {
      const s = block.match(new RegExp('  ' + sec + ':\n((?:    [^\\n]+\\n|\\n)*)'))
      if (!s) continue
      const bu = s[1].match(/^    baseUrl:\s*['"]?([^'"\n]+)['"]?/m)
      const mo = s[1].match(/^    model:\s*['"]?([^'"\n]+)['"]?/m)
      if (bu) out[sec].baseUrl = bu[1].trim()
      if (mo) out[sec].model = mo[1].trim()
    }
    return out
  } catch {
    return {}
  }
}

function loadCreds() {
  if (!existsSync(CREDS_FILE)) return {}
  try {
    const raw = readFileSync(CREDS_FILE, 'utf8')
    const llm = raw.match(/^research_llm_apiKey:\s*['"]?([^'"\n]+)['"]?/m)
    const emb = raw.match(/^research_embedding_apiKey:\s*['"]?([^'"\n]+)['"]?/m)
    return {
      llm: llm ? llm[1].trim() : '',
      embedding: emb ? emb[1].trim() : '',
    }
  } catch {
    return { llm: '', embedding: '' }
  }
}

let _config = null
function getConfig() {
  if (_config) return _config
  const s = loadSettings()
  const c = loadCreds()
  _config = {
    llmBase: s.llm.baseUrl || process.env.RESEARCH_LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://ark.cn-beijing.volces.com',
    llmKey: c.llm || process.env.RESEARCH_LLM_API_KEY || process.env.OPENAI_API_KEY || '',
    llmModel: s.llm.model || process.env.RESEARCH_LLM_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'ark-code-latest',
    embBase: s.embedding.baseUrl || process.env.RESEARCH_EMBEDDING_BASE_URL || (s.llm.baseUrl || process.env.RESEARCH_LLM_BASE_URL || 'https://ark.cn-beijing.volces.com'),
    embKey: c.embedding || process.env.RESEARCH_EMBEDDING_API_KEY || (c.llm || process.env.OPENAI_API_KEY || ''),
    embModel: s.embedding.model || process.env.RESEARCH_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || 'doubao-embedding-vision',
  }
  return _config
}
const LLM_BASE = 'pending'
const LLM_KEY = 'pending'
const LLM_MODEL = 'pending'
const EMB_BASE = 'pending'
const EMB_KEY = 'pending'
const EMB_MODEL = 'pending'

// 2026-08-21 uaenamyf: 未配置 API Key 时的统一中文提示。走网关的调用（论文问答 /
// 写作 / 综述 / 卡片）在没有系统 key 时会收到这条消息；用户在 设置 → 研究区大模型
// 配置自己的 key 后走 override 直连，不再经过网关 key 检查。
const NO_KEY_MESSAGE = '暂未配置 API Key：请前往「设置 → 研究区大模型」配置 LLM / Embedding 的 API Key 后使用'
const NO_EMBED_KEY_MESSAGE = '暂未配置 Embedding API Key：请前往「设置 → 研究区大模型」配置嵌入向量的 API Key 后使用'

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
    `[research-llm-gateway] loaded — unified LLM/Embedding API (DSH settings/credentials dynamic load)`,
  )

  ctx.webServer.register({
    kind: 'exact',
    path: '/v1/chat/completions',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        return json(res, 405, { error: { message: 'method not allowed', type: 'invalid_request_error' } })
      }
      if (rateLimited(clientKey(req))) return tooMany(req, res)
      // 2026-08-21 uaenamyf: 未配置系统 key 时直接提示，避免 401/502 英文报错
      const cfg = getConfig()
      if (!cfg.llmKey) return json(res, 400, { error: { message: NO_KEY_MESSAGE, type: 'config_error' } })
      let body
      try {
        body = withModel(await readJson(req), cfg.llmModel)
      } catch {
        return json(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } })
      }
      try {
        const upstream = await fetch(`${cfg.llmBase}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.llmKey}` },
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
      // 2026-08-21 uaenamyf: 嵌入同样检查 key
      const cfg = getConfig()
      if (!cfg.embKey) return json(res, 400, { error: { message: NO_EMBED_KEY_MESSAGE, type: 'config_error' } })
      let body
      try {
        body = withModel(await readJson(req), cfg.embModel)
      } catch {
        return json(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } })
      }
      try {
        const upstream = await fetch(`${cfg.embBase}/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.embKey}` },
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
