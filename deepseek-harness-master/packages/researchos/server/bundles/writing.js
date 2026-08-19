// Phase 3 research-writing: ResearchOS writing agent bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy stack exposes (backend
// /api/writing/rewrite + /api/writing/translate-machine -> ai-service
// writing_agent), as a dsh-native bundle whose LLM calls go through the
// SHARED LLM gateway (requirement 3). Prompts are copied verbatim from
// ai-service/app/agents/prompts/writing.py so outputs stay consistent.
//
// Routes (mounted on the dsh webserver, prefix /research-writing):
//   POST /research-writing/rewrite
//     { text, action?: polish|expand|shorten|translate|rebuttal|cover_letter,
//       instruction?, llmOverride?: { apiKey?, baseUrl?, defaultModel?, temperature? } }
//     -> { action, text }
//   POST /research-writing/translate-machine
//     { text, targetLang? (default zh-CN) }
//     -> { text, sourceLang, targetLang }   (MyMemory free engine, no key)
//
// LLM routing (mirror ai-service llm/client.py):
//   - no override -> shared gateway  POST {GATEWAY}/v1/chat/completions (model = RESEARCH_LLM_MODEL)
//   - override    -> direct OpenAI-compatible call to override.baseUrl with override.apiKey/model
//   - override failure -> automatic retry with the system default (no override)
//   - code fences stripped from the result
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_GATEWAY_URL   (shared gateway root, default http://127.0.0.1:3081)
//   RESEARCH_LLM_MODEL     (chat model, default ark-code-latest)
//   JWT_SECRET             (shared with backend; fallback = backend yml default)
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE (for the user-existence auth check)
// @module @researchos/dsh-research-writing

import jwt from 'jsonwebtoken'
import mysql from 'mysql2/promise'

export const name = 'research-writing'

export const inject = ['webServer']

const DB = {
  host: process.env.RESEARCH_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.RESEARCH_MYSQL_PORT || 3306),
  user: process.env.RESEARCH_MYSQL_USER || 'researchos',
  password: process.env.RESEARCH_MYSQL_PASSWORD || 'researchos',
  database: process.env.RESEARCH_MYSQL_DATABASE || 'researchos',
}

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

const GATEWAY = (process.env.RESEARCH_GATEWAY_URL || 'http://127.0.0.1:3081').replace(/\/+$/, '')
const MODEL = process.env.RESEARCH_LLM_MODEL || 'ark-code-latest'

// ── prompts (verbatim from ai-service/app/agents/prompts/writing.py) ───────

const WRITING_SYSTEM = `You are a professional academic writing assistant helping researchers improve their manuscripts.

Your task is to transform the user's text according to the requested action.

Rules:
- Preserve the original meaning, technical accuracy, and factual claims.
- Do not invent data, citations, or results that are not in the input.
- Maintain the original language unless the action requires otherwise.
- Output only the transformed text, without explanations, preamble, or meta-commentary.
- Follow academic writing conventions (formal tone, precise wording).`

const ACTION_INSTRUCTIONS = {
  polish:
    'Polish the following text to improve clarity, grammar, and academic tone. Keep the structure and length roughly the same.',
  expand:
    'Expand the following text with more detail, elaboration, and supporting explanation, while staying faithful to the original meaning.',
  shorten:
    'Condense the following text to be more concise while preserving all key information and academic tone.',
  translate:
    'Translate the following text into the target language specified in the instruction (default: English if none given), preserving academic tone and terminology.',
  rebuttal:
    'Draft a professional, polite point-by-point response to the reviewer comments provided in the instruction, based on the author\'s text/manuscript context below.',
  cover_letter:
    'Write a concise, professional cover letter to the journal editor based on the manuscript summary provided below.',
}

const DEFAULT_ACTION = 'polish'

function buildUserPrompt(actionInstruction, instruction, text) {
  const instructionBlock = instruction && instruction.trim() ? `[INSTRUCTION]\n${instruction.trim()}\n\n` : ''
  return `${actionInstruction}\n\n${instructionBlock}[TEXT]\n${text}\n\nReturn only the resulting text.`
}

// ── helpers ────────────────────────────────────────────────────────────────

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function ok(res, data) {
  sendJson(res, 200, { code: 0, message: 'ok', data })
}

function fail(res, status, message) {
  sendJson(res, status, { code: status, message, data: null })
}

function extractToken(req) {
  const cookieHeader = req.headers.cookie || ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === 'access_token' && v.length) return v.join('=').trim()
  }
  const auth = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  return m ? m[1].trim() : null
}

async function currentUserId(pool, req) {
  const token = extractToken(req)
  if (!token) return null
  let claims
  try {
    claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return null
  }
  const [rows] = await pool.query('SELECT id FROM app_user WHERE id = ?', [claims.sub])
  if (!rows.length) return null
  return Number(rows[0].id)
}

/** One non-streaming LLM completion; override bypasses the gateway (mirror llm_client.complete). */
async function callLLM(system, user, override) {
  const hasOverride = override && (override.apiKey || override.baseUrl)
  const url = hasOverride
    ? `${String(override.baseUrl || '').replace(/\/+$/, '')}/chat/completions`
    : `${GATEWAY}/v1/chat/completions`
  const model = hasOverride && override.defaultModel ? override.defaultModel : MODEL
  const headers = hasOverride
    ? { 'content-type': 'application/json', authorization: `Bearer ${override.apiKey}` }
    : { 'content-type': 'application/json' }
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
  if (override && override.temperature != null) body.temperature = Number(override.temperature)
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })
  if (!resp.ok) throw new Error(`llm http ${resp.status}`)
  const j = await resp.json()
  const content = j?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('llm empty content')
  return content
}

/** Override failure falls back to the system default (mirror llm_client.complete). */
async function rewriteOnce(system, user, override) {
  try {
    return await callLLM(system, user, override)
  } catch (e) {
    if (override && (override.apiKey || override.baseUrl || override.provider)) {
      return callLLM(system, user, null)
    }
    throw e
  }
}

function stripCodeFence(text) {
  const stripped = String(text).trim()
  if (stripped.startsWith('```')) {
    const lines = stripped.split('\n').slice(1)
    if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop()
    return lines.join('\n').trim()
  }
  return stripped
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = mysql.createPool(DB)
  ctx.logger.info(`[research-writing] loaded — writing agent via shared gateway ${GATEWAY}, model ${MODEL}`)

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-writing',
    handler: async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
      const seg = (() => {
        const s = pathname.replace(/^\/research-writing\/?/, '')
        return s ? s.split('/') : []
      })()
      const method = req.method

      const userId = await currentUserId(pool, req)
      if (userId === null) return fail(res, 401, 'unauthorized')

      // POST /research-writing/rewrite
      if (method === 'POST' && seg[0] === 'rewrite') {
        let body
        try {
          body = await readJson(req)
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const text = String(body.text || '')
        if (!text.trim()) return ok(res, { action: DEFAULT_ACTION, text: '' })
        const rawAction = String(body.action || DEFAULT_ACTION).trim().toLowerCase()
        const action = ACTION_INSTRUCTIONS[rawAction] ? rawAction : DEFAULT_ACTION
        const instruction = String(body.instruction || '')
        const override = body.llmOverride || null
        try {
          const userPrompt = buildUserPrompt(ACTION_INSTRUCTIONS[action], instruction, text)
          const raw = await rewriteOnce(WRITING_SYSTEM, userPrompt, override)
          return ok(res, { action, text: stripCodeFence(raw) })
        } catch (e) {
          ctx.logger.warn(`[research-writing] rewrite error: ${e.message}`)
          return fail(res, 502, `AI service temporarily unavailable: ${e.message}`)
        }
      }

      // POST /research-writing/translate-machine (MyMemory default engine, mirror backend)
      if (method === 'POST' && seg[0] === 'translate-machine') {
        let body
        try {
          body = await readJson(req)
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const text = String(body.text || '')
        const target = String(body.targetLang || 'zh-CN').trim()
        if (!text.trim()) return ok(res, { text: '', sourceLang: null, targetLang: target })
        try {
          const clipped = text.length > 500 ? text.slice(0, 500) : text
          const source = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(clipped) ? 'zh-CN' : 'en' // detectSourceLang
          const myMemoryLang = { en: 'en', ja: 'ja', ko: 'ko', fr: 'fr', de: 'de', es: 'es', ru: 'ru', pt: 'pt' }[target.trim().toLowerCase()] || 'zh-CN'
          const resp = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clipped)}&langpair=${encodeURIComponent(`${source}|${myMemoryLang}`)}`,
            { headers: { 'user-agent': 'Mozilla/5.0 ResearchOS' }, signal: AbortSignal.timeout(20000) },
          )
          if (!resp.ok) throw new Error(`mymemory http ${resp.status}`)
          const j = await resp.json()
          if (j?.quotaFinished) throw new Error('mymemory daily quota finished')
          const translated = j?.responseData?.translatedText ?? ''
          if (!translated) throw new Error('mymemory empty result')
          return ok(res, { text: translated, sourceLang: source, targetLang: target })
        } catch (e) {
          ctx.logger.warn(`[research-writing] translate-machine error: ${e.message}`)
          return fail(res, 502, `machine translation unavailable: ${e.message}`)
        }
      }

      return fail(res, 404, 'not found')
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
  })
}

export default { name, inject, apply }
