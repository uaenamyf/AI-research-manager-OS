// Phase 5 research-ai-worker bundle: exposes the DSH-native AI pipeline as
// HTTP routes on the dsh webserver. Routes are the integration point for the
// research-paper / research-review bundles once they stop publishing to MQ
// (see plan.md Phase 5 — AI 管道迁入 DSH).
//
//   POST /research-ai-worker/analyze  { paperId }  -> fires async, { status: 'PROCESSING' }
//   POST /research-ai-worker/cleanup  { paperId }  -> awaits, { deleted }
//   POST /research-ai-worker/review   { taskId, paperIds, topic } -> fires async, { status: 'PROCESSING' }
//   GET  /research-ai-worker/health                -> { ok, gateway, model }
//
// Auth: X-Internal-Token or a valid shared-JWT (internal bundle-to-bundle
// calls use the token; the UI never calls these endpoints directly).
// @module @researchos/dsh-research-ai-worker

import { analyzePaper, cleanupPaper } from './lib/analyze.js'
import { generateReview } from './lib/review.js'
import { GATEWAY, LLM_MODEL, EMBED_MODEL, INTERNAL_TOKEN } from './lib/config.js'
import jwt from 'jsonwebtoken'

export const name = 'research-ai-worker'

export const inject = ['webServer']

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

function readJson(req) {
  return new Promise((resolve, reject) => {
    // 2026-08-20 myf: 与 llm-gateway 同源修复——`body += c`（Buffer 隐式
    // toString）逐 chunk 解码，分块边界切断多字节 UTF-8 时产生 U+FFFD。
    // 改为累积 Buffer 统一 decode。
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

function authorized(req) {
  // internal token (bundle-to-bundle) or a valid shared JWT
  if (INTERNAL_TOKEN && req.headers['x-internal-token'] === INTERNAL_TOKEN) return true
  const cookieHeader = req.headers.cookie || ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === 'access_token' && v.length) {
      try {
        jwt.verify(v.join('=').trim(), JWT_SECRET, { algorithms: ['HS256'] })
        return true
      } catch {
        return false
      }
    }
  }
  const auth = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (!m) return false
  try {
    jwt.verify(m[1].trim(), JWT_SECRET, { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

export function apply(ctx) {
  ctx.logger.info(
    `[research-ai-worker] loaded — DSH-native AI pipeline (gateway=${GATEWAY}, llm=${LLM_MODEL}, embed=${EMBED_MODEL})`,
  )

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-ai-worker',
    handler: async (req, res) => {
      if (!authorized(req)) return fail(res, 401, 'unauthorized')

      const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
      const seg = pathname.replace(/^\/research-ai-worker\/?/, '').split('/').filter(Boolean)
      const method = req.method

      // GET /research-ai-worker/health
      if (method === 'GET' && seg[0] === 'health') {
        return ok(res, { ok: true, gateway: GATEWAY, llmModel: LLM_MODEL, embedModel: EMBED_MODEL })
      }

      // POST /research-ai-worker/analyze { paperId }
      if (method === 'POST' && seg[0] === 'analyze') {
        let body
        try {
          body = await readJson(req)
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const paperId = String(body.paperId || '').trim()
        if (!paperId) return fail(res, 400, 'paperId required')
        // fire and forget — status is observable on paper.status (PROCESSING -> READY/FAILED)
        analyzePaper(paperId).then(
          (r) => ctx.logger.info(`[research-ai-worker] analyze done: ${JSON.stringify(r)}`),
          (e) => ctx.logger.error(`[research-ai-worker] analyze error: ${e.message}`),
        )
        return ok(res, { paperId, status: 'PROCESSING' })
      }

      // POST /research-ai-worker/cleanup { paperId }
      if (method === 'POST' && seg[0] === 'cleanup') {
        let body
        try {
          body = await readJson(req)
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const paperId = String(body.paperId || '').trim()
        if (!paperId) return fail(res, 400, 'paperId required')
        try {
          const r = await cleanupPaper(paperId)
          return ok(res, r)
        } catch (e) {
          return fail(res, 500, `cleanup failed: ${e.message}`)
        }
      }

      // POST /research-ai-worker/review { taskId, paperIds, topic, llmOverride? }
      if (method === 'POST' && seg[0] === 'review') {
        let body
        try {
          body = await readJson(req)
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const taskId = Number(body.taskId)
        const paperIds = Array.isArray(body.paperIds) ? body.paperIds.map(String).filter(Boolean) : []
        if (!Number.isInteger(taskId) || taskId <= 0) return fail(res, 400, 'taskId required')
        if (!paperIds.length) {
          return fail(res, 400, 'paperIds must be a non-empty array of ids')
        }
        const topic = String(body.topic || '')
        const override = body.llmOverride && typeof body.llmOverride === 'object' ? body.llmOverride : undefined
        generateReview(taskId, paperIds, topic, override).then(
          (r) => ctx.logger.info(`[research-ai-worker] review done: ${JSON.stringify(r)}`),
          (e) => ctx.logger.error(`[research-ai-worker] review error: ${e.message}`),
        )
        return ok(res, { taskId, status: 'PROCESSING' })
      }

      return fail(res, 404, 'not found')
    },
  })
}

export default { name, inject, apply }
