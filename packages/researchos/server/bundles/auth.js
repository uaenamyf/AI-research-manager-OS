// Phase 3 research-auth: ResearchOS user session bundle running inside dsh.
//
// 2026-08-20 myf: 登录/注册/订阅功能已移除（register / login / logout 端点
// 删除，subscription bundle 一并下线）。研究区不再需要账号体系：
// 保留两个端点支撑「本地用户信息持久化」——
//   GET /research-auth/me   读取当前本地用户（cookie 中的 JWT）
//   GET /research-auth/anon 本地用户引导：自动创建/复用本地用户并签发 JWT cookie
// 所有研究区数据（项目/论文/设置）仍按 app_user.id 归属并持久化到 SQLite，
// 权限模型不变（真实 JWT + user_id 过滤）。
//
// Routes (mounted on the dsh webserver, default port 3081):
//   GET  /research-auth/me          (cookie) -> { code, message, data: userDto }
//   GET  /research-auth/anon        -> 引导本地用户 + httpOnly cookie
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
//   JWT_ACCESS_TTL    (optional, e.g. 7d, default 7d)
//   RESEARCH_ANON_ENABLED=1  启用 anon 引导（研究区无登录 UI 时的本地用户入口）
//   RESEARCH_ANON_USER_ID     指定本地用户 id（缺省用 RESEARCH_ANON_EMAIL 账号）
//   RESEARCH_ANON_EMAIL       本地用户邮箱（不存在自动创建，默认 research@local）
// @module @researchos/dsh-research-auth

import { createPool } from '../../lib/db.js'
import jwt from 'jsonwebtoken'

export const name = 'research-auth'

export const inject = ['webServer']

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

function parseTtl(raw) {
  const m = /^(\d+)([dhms])?$/.exec(String(raw || '7d'))
  if (!m) return 7 * 24 * 3600 * 1000
  const mult = { d: 86400, h: 3600, m: 60, s: 1 }[m[2] || 'd'] || 86400
  return Number(m[1]) * mult * 1000
}
const ACCESS_TTL_MS = parseTtl(process.env.JWT_ACCESS_TTL)
const COOKIE_NAME = 'access_token'

// ── helpers ────────────────────────────────────────────────────────────────

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

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(ACCESS_TTL_MS / 1000)}; SameSite=Lax`,
  ])
}

/** Read token from cookie, else Authorization: Bearer. */
function extractToken(req) {
  const cookieHeader = req.headers.cookie || ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE_NAME && v.length) return v.join('=').trim()
  }
  const auth = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  return m ? m[1].trim() : null
}

function signToken(user) {
  // Mirrors JwtTokenProvider.generateAccessToken: sub=userId, claims email/plan, iat+exp.
  return jwt.sign({ email: user.email, plan: user.plan }, JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
  })
}

function verifyToken(token) {
  // Mirrors JwtTokenProvider.parse: same key + HS256; throws on invalid/expired.
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
}

function toDto(row) {
  // Mirror backend UserDto / LocalDateTime serialization (space -> ISO 'T').
  const createdTime = row.created_time instanceof Date ? row.created_time.toISOString() : String(row.created_time || '').replace(' ', 'T')
  return { id: Number(row.id), email: row.email, plan: row.plan, createdTime }
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = createPool()
  ctx.logger.info(
    `[research-auth] loaded — local-user session over SQLite app_user, JWT TTL ${ACCESS_TTL_MS / 1000}s`,
  )

  const register = (path, handler) => {
    ctx.webServer.register({ kind: 'exact', path, handler })
  }

  register('/research-auth/me', async (req, res) => {
    if (req.method !== 'GET') return fail(res, 405, 'method not allowed')
    const token = extractToken(req)
    if (!token) return fail(res, 401, 'unauthorized')
    let claims
    try {
      claims = verifyToken(token)
    } catch {
      return fail(res, 401, 'invalid or expired token')
    }
    try {
      const [rows] = await pool.query(
        'SELECT id, email, plan, created_time FROM app_user WHERE id = ?',
        [claims.sub],
      )
      if (!rows.length) return fail(res, 401, 'user not found')
      return ok(res, toDto(rows[0]))
    } catch (e) {
      ctx.logger.warn(`[research-auth] me error: ${e.message}`)
      return fail(res, 500, `load user failed: ${e.message}`)
    }
  })

  // 2026-08-18 uaenamyf: 研究区无登录 UI 时的静默引导端点（dev-only）。
  // RESEARCH_ANON_ENABLED=1 时：若配置 RESEARCH_ANON_USER_ID，则直接为指定已有用户签发
  // JWT cookie（显式授权——dev 单用户场景下研究区直接呈现该用户数据，权限模型不变：
  // 真实 JWT + user_id 过滤）；未配置则确保 RESEARCH_ANON_EMAIL 账号存在（不存在以随机
  // 密码自动注册）后签发。生产保持开关关闭（端点 404，研究区显示「未登录」提示）。
  // 2026-08-20 myf: 登录/注册已移除后，anon 成为唯一的本地用户引导入口——保证
  // 本地用户信息（项目/论文/设置）始终有归属 user 并持久化到 SQLite。
  register('/research-auth/anon', async (req, res) => {
    if (req.method !== 'GET') return fail(res, 405, 'method not allowed')
    if (process.env.RESEARCH_ANON_ENABLED !== '1') return fail(res, 404, 'not found')
    try {
      const anonUserId = Number(process.env.RESEARCH_ANON_USER_ID || 0)
      let user
      if (anonUserId > 0) {
        const [rows] = await pool.query(
          'SELECT id, email, plan, created_time FROM app_user WHERE id = ?',
          [anonUserId],
        )
        if (!rows.length) return fail(res, 404, 'anon user id not found')
        user = rows[0]
      } else {
        const email = String(process.env.RESEARCH_ANON_EMAIL || 'research@local').trim()
        let [rows] = await pool.query(
          'SELECT id, email, plan, created_time FROM app_user WHERE email = ?',
          [email],
        )
        if (!rows.length) {
          // 2026-08-20 myf: 登录已移除，无需密码——password 列置空即可
          // （SQLite schema password TEXT 可空）。
          await pool.query(
            'INSERT INTO app_user (email, password, plan, settings) VALUES (?, NULL, ?, ?)',
            [email, 'FREE', JSON.stringify({})],
          )
          ;[rows] = await pool.query(
            'SELECT id, email, plan, created_time FROM app_user WHERE email = ?',
            [email],
          )
          ctx.logger.info(`[research-auth] anon account provisioned: ${email}`)
        }
        user = rows[0]
      }
      setAuthCookie(res, signToken(user))
      return ok(res, { user: toDto(user), anon: true })
    } catch (e) {
      ctx.logger.warn(`[research-auth] anon error: ${e.message}`)
      return fail(res, 500, `anon bootstrap failed: ${e.message}`)
    }
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
  })
}

export default { name, inject, apply }
