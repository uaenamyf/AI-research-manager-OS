// Phase 3 research-review: ResearchOS literature review generation bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy backend ReviewController +
// AiTaskService expose, as a dsh bundle talking directly to the MySQL ai_task
// table and publishing to the shared RabbitMQ (researchos.ai.task). The
// ai-service consumes q.review.generate, generates the markdown review
// (paper metadata + RAG over paper_chunk + LLM via the shared gateway), then
// calls the legacy backend PATCH /internal/task/{id}/result — which updates the
// SAME ai_task row this bundle created. So the bundle plugs into the existing
// pipeline and the task poll endpoint reads the finished result.
//
// Routes (mounted on the dsh webserver, prefix /research-review):
//   POST /research-review/generate   { paperIds: number[], topic: string } -> { taskId }  (JWT)
//   GET  /research-review/:taskId                                           -> task       (JWT, ownership)
//
// Async contract (mirror backend -> ai-service, Implementation/70-async-mq.md):
//   publish exchange "researchos.ai.task" routing "review.generate",
//   message { taskId, type: "REVIEW_GENERATION", payload: { paperIds, topic } }.
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_RABBITMQ_URL  (default amqp://guest:guest@127.0.0.1:5672)
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos@127.0.0.1:3306/researchos)
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
// @module @researchos/dsh-research-review

import jwt from 'jsonwebtoken'
import mysql from 'mysql2/promise'
import amqplib from 'amqplib'

export const name = 'research-review'

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

const MQ_URL = process.env.RESEARCH_RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672'
const MQ_EXCHANGE = 'researchos.ai.task'

// Phase 5 AI 管道迁入 DSH：RESEARCH_AI_INLINE=1 时 generate 直接调用
// research-ai-worker bundle（HTTP + X-Internal-Token），不再发 MQ。
const AI_INLINE = process.env.RESEARCH_AI_INLINE === '1'
const GATEWAY = (process.env.RESEARCH_GATEWAY_URL || 'http://127.0.0.1:3080').replace(/\/+$/, '')
const INTERNAL_TOKEN = process.env.RESEARCH_INTERNAL_TOKEN || process.env.INTERNAL_TOKEN || 'dev-internal-token'

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

function normTime(v) {
  if (v instanceof Date) return v.toISOString()
  return v ? String(v).replace(' ', 'T') : null
}

function toTaskDto(row) {
  let result = row.result
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result)
    } catch {
      result = null
    }
  }
  return {
    taskId: Number(row.task_id),
    userId: Number(row.user_id),
    type: row.type,
    status: row.status,
    result,
    error: row.error ?? null,
    createdTime: normTime(row.created_time),
  }
}

/** Publish an AI task to the shared RabbitMQ exchange; returns true on success. */
let mqConn = null
async function publishTask(taskId, type, payload, routing) {
  try {
    if (!mqConn) mqConn = await amqplib.connect(MQ_URL)
    const ch = await mqConn.createChannel()
    const msg = Buffer.from(JSON.stringify({ taskId, type, payload }))
    const ok = ch.publish(MQ_EXCHANGE, routing, msg, { persistent: true })
    await ch.close()
    return !!ok
  } catch (e) {
    try {
      mqConn?.close()
    } catch {
      /* ignore */
    }
    mqConn = null
    return false
  }
}

/** Trigger review generation: inline worker (RESEARCH_AI_INLINE=1) or MQ. */
async function triggerReview(taskId, paperIds, topic, llmOverride) {
  if (AI_INLINE) {
    try {
      const res = await fetch(`${GATEWAY}/research-ai-worker/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
        body: JSON.stringify({ taskId, paperIds, topic, llmOverride }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(`worker review HTTP ${res.status}: ${j.message || ''}`)
      }
      return true
    } catch {
      return false
    }
  }
  return publishTask(taskId, 'REVIEW_GENERATION', { paperIds, topic, llmOverride }, 'review.generate')
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = mysql.createPool(DB)
  ctx.logger.info(
    `[research-review] loaded — review tasks over MySQL ai_task (${DB.user}@${DB.host}:${DB.port}/${DB.database}), MQ=${MQ_EXCHANGE}`,
  )

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-review',
    handler: async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
      const seg = (() => {
        const s = pathname.replace(/^\/research-review\/?/, '')
        return s ? s.split('/') : []
      })()
      const method = req.method

      const userId = await currentUserId(pool, req)
      if (userId === null) return fail(res, 401, 'unauthorized')

      // POST /research-review/generate
      if (method === 'POST' && seg[0] === 'generate') {
        let body
        try {
          body = await readJson(req)
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const paperIds = Array.isArray(body.paperIds) ? body.paperIds.map(Number) : []
        const topic = String(body.topic || '').trim()
        if (!paperIds.length || paperIds.some((id) => !Number.isInteger(id) || id <= 0)) {
          return fail(res, 400, 'paperIds must be a non-empty array of ids')
        }
        if (!topic) return fail(res, 400, 'topic is required')
        try {
          // Ownership gate for every paper (mirror requirePaperOwnedBy).
          const placeholders = paperIds.map(() => '?').join(',')
          const [rows] = await pool.query(
            `SELECT DISTINCT id FROM paper WHERE id IN (${placeholders}) AND user_id = ?`,
            [...paperIds, userId],
          )
          if (rows.length !== paperIds.length) return fail(res, 404, 'one or more papers not found')

          const [result] = await pool.query(
            "INSERT INTO ai_task (user_id, type, status, created_time) VALUES (?, 'REVIEW_GENERATION', 'PENDING', NOW(6))",
            [userId],
          )
          const sent = await triggerReview(result.insertId, paperIds, topic)
          if (!sent) {
            await pool.query('DELETE FROM ai_task WHERE task_id = ?', [result.insertId])
            return fail(res, 500, 'failed to enqueue review task')
          }
          return ok(res, { taskId: result.insertId })
        } catch (e) {
          ctx.logger.warn(`[research-review] generate error: ${e.message}`)
          return fail(res, 500, `generate failed: ${e.message}`)
        }
      }

      // GET /research-review/:taskId
      if (method === 'GET' && seg[0] && /^\d+$/.test(seg[0])) {
        const taskId = Number(seg[0])
        try {
          const [rows] = await pool.query(
            'SELECT task_id, user_id, type, status, result, error, created_time FROM ai_task WHERE task_id = ? AND user_id = ?',
            [taskId, userId],
          )
          if (!rows.length) return fail(res, 404, 'task not found')
          return ok(res, toTaskDto(rows[0]))
        } catch (e) {
          ctx.logger.warn(`[research-review] get task error: ${e.message}`)
          return fail(res, 500, `load task failed: ${e.message}`)
        }
      }

      return fail(res, 404, 'not found')
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
    mqConn?.close().catch(() => {})
  })
}

export default { name, inject, apply }
