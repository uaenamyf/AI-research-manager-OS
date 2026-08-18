// Phase 3 research-auth: ResearchOS user authentication bundle running inside dsh.
//
// Purpose (dual-auth): serve the SAME auth contract the legacy Spring Boot
// backend exposes (`/api/auth/*`), but as a dsh bundle talking directly to the
// MySQL app_user table. Tokens are JWT HS256 signed with the SAME secret the
// backend uses (JWT_SECRET), so a token issued here validates on the old backend
// and vice versa — frontend can switch without a user-facing re-login.
//
// Routes (mounted on the dsh webserver, default port 3081):
//   POST /research-auth/register   { email, password }  -> { code, message, data:{ user } } + httpOnly cookie
//   POST /research-auth/login      { email, password }  -> same as register
//   POST /research-auth/logout                          -> clears cookie
//   GET  /research-auth/me          (cookie or Authorization: Bearer) -> { code, message, data: userDto }
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos@127.0.0.1:3306/researchos)
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
//   JWT_ACCESS_TTL    (optional, e.g. 7d, default 7d)
// @module @researchos/dsh-research-auth

import { randomBytes } from 'node:crypto'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export const name = 'research-auth'

export const inject = ['webServer']

const DB = {
  host: process.env.RESEARCH_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.RESEARCH_MYSQL_PORT || 3306),
  user: process.env.RESEARCH_MYSQL_USER || 'researchos',
  password: process.env.RESEARCH_MYSQL_PASSWORD || 'researchos',
  database: process.env.RESEARCH_MYSQL_DATABASE || 'researchos',
}

// Same secret the Spring Boot backend uses (application.yml app.jwt.secret,
// overridable via JWT_SECRET) — UTF-8 bytes of this string are the HMAC key
// (JwtTokenProvider uses hmacShaKeyFor(secret.getBytes())), reproduced here.
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

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(ACCESS_TTL_MS / 1000)}; SameSite=Lax`,
  ])
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', [`${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`])
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

function emailOk(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = mysql.createPool(DB)
  ctx.logger.info(
    `[research-auth] loaded — auth over MySQL app_user (${DB.user}@${DB.host}:${DB.port}/${DB.database}), JWT TTL ${ACCESS_TTL_MS / 1000}s`,
  )

  const register = (path, handler) => {
    ctx.webServer.register({ kind: 'exact', path, handler })
  }

  register('/research-auth/register', async (req, res) => {
    if (req.method !== 'POST') return fail(res, 405, 'method not allowed')
    let body
    try {
      body = await readJson(req)
    } catch {
      return fail(res, 400, 'invalid JSON body')
    }
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    if (!emailOk(email)) return fail(res, 400, 'email is not valid')
    if (password.length < 8) return fail(res, 400, 'password must be at least 8 characters')
    try {
      const [rows] = await pool.query('SELECT id FROM app_user WHERE email = ?', [email])
      if (rows.length) return fail(res, 400, 'email already exists')
      const hash = await bcrypt.hash(password, 10)
      await pool.query(
        'INSERT INTO app_user (email, password, plan, settings) VALUES (?, ?, ?, ?)',
        [email, hash, 'FREE', JSON.stringify({})],
      )
      const [fresh] = await pool.query(
        'SELECT id, email, plan, created_time FROM app_user WHERE email = ?',
        [email],
      )
      const user = fresh[0]
      setAuthCookie(res, signToken(user))
      return ok(res, { user: toDto(user) })
    } catch (e) {
      ctx.logger.warn(`[research-auth] register error: ${e.message}`)
      return fail(res, 500, `register failed: ${e.message}`)
    }
  })

  register('/research-auth/login', async (req, res) => {
    if (req.method !== 'POST') return fail(res, 405, 'method not allowed')
    let body
    try {
      body = await readJson(req)
    } catch {
      return fail(res, 400, 'invalid JSON body')
    }
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    if (!email || !password) return fail(res, 400, 'email and password are required')
    try {
      const [rows] = await pool.query(
        'SELECT id, email, password, plan, created_time FROM app_user WHERE email = ?',
        [email],
      )
      const user = rows[0]
      if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
        return fail(res, 401, 'invalid email or password')
      }
      setAuthCookie(res, signToken(user))
      return ok(res, { user: toDto(user) })
    } catch (e) {
      ctx.logger.warn(`[research-auth] login error: ${e.message}`)
      return fail(res, 500, `login failed: ${e.message}`)
    }
  })

  register('/research-auth/logout', (req, res) => {
    if (req.method !== 'POST') return fail(res, 405, 'method not allowed')
    clearCookie(res)
    return ok(res, null)
  })

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
          const password = randomBytes(24).toString('hex')
          const hash = await bcrypt.hash(password, 10)
          await pool.query(
            'INSERT INTO app_user (email, password, plan, settings) VALUES (?, ?, ?, ?)',
            [email, hash, 'FREE', JSON.stringify({})],
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
