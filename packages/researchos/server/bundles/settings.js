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
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { createPool } from '../../lib/db.js'

export const name = 'research-settings'

// 2026-08-21 uaenamyf: 参考 DSH「设置-模型」的保存方式 —— 配置存 DSH settings
// 文件（~/.dsh/settings.yaml 的 research 命名空间，经 ctx.settings 服务写穿），
// apiKey 存 DSH credentials 文件（~/.dsh/.credentials.yaml，经 ctx.credentials，
// write-only 不回显），不再埋入 SQLite 业务表。ai-worker 读同一文件。
// 保留 SQLite app_user 兼容读取（旧数据迁移）：getUserResearchSettings 从文件
// 优先，SQLite 兜底。
export const inject = ['webServer', 'settings', 'credentials']

/** Research namespace under DSH settings (~/.dsh/settings.yaml). */
export const RESEARCH_NS = settingsNamespace('research')

/** Durable research section schema (baseUrl/model are optional; keys via credentials). */
export const ResearchSettingsSchema = z.object({
  llm: z.object({
    baseUrl: z.string().default(''),
    model: z.string().default(''),
  }).default({}),
  embedding: z.object({
    baseUrl: z.string().default(''),
    model: z.string().default(''),
  }).default({}),
})

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

// ── plugin ─────────────────────────────────────────────────────────────────

/** Credential refs for research API keys (~/.dsh/.credentials.yaml). */
const CRED_LLM_KEY = 'research_llm_apiKey'
const CRED_EMBED_KEY = 'research_embedding_apiKey'

/** Read the research section from DSH settings; {} when unset. */
async function readSettingsFromDsh(ctx) {
  let research = {}
  try {
    const value = ctx.settings.get(RESEARCH_NS)
    if (value && typeof value === 'object') research = value
  } catch {
    /* settings namespace not registered / unreadable — fall through to SQLite */
  }
  // apiKey 从 credentials 读（resolve 拿值，前端不回显 —— 只标记 configured）
  try {
    const llmKey = await ctx.credentials.resolve(CRED_LLM_KEY)
    const embedKey = await ctx.credentials.resolve(CRED_EMBED_KEY)
    if (llmKey?.value) research.llm = { ...(research.llm || {}) }
    if (embedKey?.value) research.embedding = { ...(research.embedding || {}) }
  } catch {
    /* credentials provider unavailable — keep baseUrl/model only */
  }
  return research
}

/** Persist a research settings patch to DSH settings + credentials. */
async function writeSettingsToDsh(ctx, research) {
  const current = await readSettingsFromDsh(ctx)
  const merged = { ...current, ...research }
  // baseUrl/model → DSH settings (settings.yaml)
  const ops = []
  const setPath = (section, field) => {
    const v = merged[section]?.[field]
    ops.push({ op: v === undefined || v === null ? 'unset' : 'set', path: [section, field], value: v ?? undefined })
  }
  for (const section of ['llm', 'embedding']) {
    for (const field of ['baseUrl', 'model']) setPath(section, field)
  }
  await ctx.settings.mutate(RESEARCH_NS, ops)
  // apiKey → DSH credentials (credentials.yaml, write-only)
  const llmKey = merged.llm?.apiKey
  if (llmKey) await ctx.credentials.set(CRED_LLM_KEY, String(llmKey))
  const embedKey = merged.embedding?.apiKey
  if (embedKey) await ctx.credentials.set(CRED_EMBED_KEY, String(embedKey))
}

export function apply(ctx) {
  const pool = createPool()
  ctx.logger.info('[research-settings] loaded — research config via DSH settings (settings.yaml) + credentials (.credentials.yaml)')

  // 注册 research 命名空间（DSH settings 服务；重复注册会抛错，这里 try 兜底）。
  try {
    ctx.settings.register(RESEARCH_NS, ResearchSettingsSchema)
  } catch (e) {
    ctx.logger.warn(`[research-settings] namespace already registered or unavailable: ${e.message}`)
  }

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
          // 读：DSH settings 优先；apiKey 不回显（前端 placeholder 提示留空保持）
          const dshResearch = await readSettingsFromDsh(ctx)
          return ok(res, normalize({ research: dshResearch }))
        }

        if (req.method === 'PUT' || req.method === 'PATCH') {
          const body = await readJson(req)
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return fail(res, 400, 'settings must be a JSON object')
          }
          const patchResearch = (body.research && typeof body.research === 'object') ? body.research : {}
          await writeSettingsToDsh(ctx, patchResearch)
          const after = await readSettingsFromDsh(ctx)
          return ok(res, normalize({ research: after }))
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
