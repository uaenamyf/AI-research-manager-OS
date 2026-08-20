// Phase 3 research-settings: ResearchOS user settings bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy backend SettingsController +
// SettingsServiceImpl expose, as a dsh bundle over the MySQL app_user.settings
// JSON column. Settings hold user LLM / translation / knowledge preferences;
// every field is optional (null = system default).
//
// Routes (mounted on the dsh webserver, prefix /research-settings):
//   GET   /research-settings               -> settings object            (JWT)
//   PUT   /research-settings  { settings } -> full replace -> new value  (JWT)
//   PATCH /research-settings  { patch }    -> merge non-null -> new value (JWT)
//
// Merge semantics (mirror SettingsServiceImpl.patchSettings): only non-null
// fields inside the llm / translation / knowledge sub-objects override the
// stored values; untouched sub-objects/fields are preserved.
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos@127.0.0.1:3306/researchos)
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
// @module @researchos/dsh-research-settings

import jwt from 'jsonwebtoken'
import { createPool } from '../../lib/db.js'

export const name = 'research-settings'

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

/** Read the settings JSON for a user; returns {} when unset. */
async function readSettings(pool, userId) {
  const [rows] = await pool.query('SELECT settings FROM app_user WHERE id = ?', [userId])
  const raw = rows[0]?.settings
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) ?? {}
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' ? raw : {}
}

/** Normalize to the backend top-level shape: llm/translation/knowledge/research keys present. */
function normalize(settings) {
  return {
    llm: settings.llm && typeof settings.llm === 'object' ? settings.llm : {},
    translation: settings.translation && typeof settings.translation === 'object' ? settings.translation : {},
    knowledge: settings.knowledge && typeof settings.knowledge === 'object' ? settings.knowledge : {},
    // 2026-08-20 myf: 研究区大模型配置（前端「设置-模型-研究区大模型」区块）：
    //   research.llm       = 大模型论文解析（baseUrl / apiKey / model）
    //   research.embedding = 嵌入向量（baseUrl / apiKey / model）
    research: settings.research && typeof settings.research === 'object' ? settings.research : {},
  }
}

/** Merge non-null fields of each sub-object (mirror SettingsServiceImpl merges). */
function mergeNonNull(current, patch) {
  const out = { ...current }
  for (const key of ['llm', 'translation', 'knowledge', 'research']) {
    const sub = patch[key]
    if (sub && typeof sub === 'object') {
      out[key] = { ...(current[key] && typeof current[key] === 'object' ? current[key] : {}) }
      for (const [k, v] of Object.entries(sub)) {
        if (v !== null && v !== undefined) out[key][k] = v
      }
    }
  }
  return out
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = createPool()
  ctx.logger.info(`[research-settings] loaded — user settings over MySQL app_user (${DB.user}@${DB.host}:${DB.port}/${DB.database})`)

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-settings',
    handler: async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
      const seg = (() => {
        const s = pathname.replace(/^\/research-settings\/?/, '')
        return s ? s.split('/') : []
      })()
      if (seg.length) return fail(res, 404, 'not found')

      const userId = await currentUserId(pool, req)
      if (userId === null) return fail(res, 401, 'unauthorized')

      try {
        if (req.method === 'GET') {
          return ok(res, normalize(await readSettings(pool, userId)))
        }

        if (req.method === 'PUT' || req.method === 'PATCH') {
          const body = await readJson(req)
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return fail(res, 400, 'settings must be a JSON object')
          }
          const current = await readSettings(pool, userId)
          const merged = req.method === 'PUT' ? normalize(body) : mergeNonNull(current, body)
          await pool.query('UPDATE app_user SET settings = ? WHERE id = ?', [JSON.stringify(merged), userId])
          return ok(res, merged)
        }

        return fail(res, 405, 'method not allowed')
      } catch (e) {
        ctx.logger.warn(`[research-settings] error: ${e.message}`)
        return fail(res, 500, `operation failed: ${e.message}`)
      }
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
  })
}

export default { name, inject, apply }
