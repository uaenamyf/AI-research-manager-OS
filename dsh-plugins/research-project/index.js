// Phase 3 research-project: ResearchOS project CRUD bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy Spring Boot ProjectController
// exposes (`/api/projects`), but as a dsh bundle talking directly to the MySQL
// research_project table. Every query is filtered by user_id (ownership rule),
// and auth reuses the shared JWT (same JWT_SECRET as research-auth / backend),
// so a token issued by /research-auth/login works here unchanged.
//
// Routes (mounted on the dsh webserver, prefix /research-project):
//   POST   /research-project            { name, description, domain } -> project (create)
//   GET    /research-project?page=0&size=20                            -> { items, page, size, total, totalPages }
//   GET    /research-project/:id                                       -> project (404 if not owned)
//   DELETE /research-project/:id                                       -> ok (404 if not owned)
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos@127.0.0.1:3306/researchos)
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
// @module @researchos/dsh-research-project

import mysql from 'mysql2/promise'
import jwt from 'jsonwebtoken'

export const name = 'research-project'

export const inject = ['webServer']

const DB = {
  host: process.env.RESEARCH_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.RESEARCH_MYSQL_PORT || 3306),
  user: process.env.RESEARCH_MYSQL_USER || 'researchos',
  password: process.env.RESEARCH_MYSQL_PASSWORD || 'researchos',
  database: process.env.RESEARCH_MYSQL_DATABASE || 'researchos',
}

// Same secret as research-auth / Spring Boot JwtTokenProvider.
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

/** Resolve current user id from the shared JWT; returns null when unauthenticated. */
async function currentUserId(pool, req) {
  const token = extractToken(req)
  if (!token) return null
  let claims
  try {
    claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return null
  }
  // Mirror JwtAuthFilter: only a token whose subject still exists counts.
  const [rows] = await pool.query('SELECT id FROM app_user WHERE id = ?', [claims.sub])
  if (!rows.length) return null
  return Number(rows[0].id)
}

function toProjectDto(row) {
  const createdTime =
    row.created_time instanceof Date ? row.created_time.toISOString() : String(row.created_time || '').replace(' ', 'T')
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: row.name,
    description: row.description ?? null,
    domain: row.domain ?? null,
    createdTime,
  }
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = mysql.createPool(DB)
  ctx.logger.info(
    `[research-project] loaded — project CRUD over MySQL research_project (${DB.user}@${DB.host}:${DB.port}/${DB.database})`,
  )

  // One prefix route covers both the collection and the /:id item routes.
  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-project',
    handler: async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
      const userId = await currentUserId(pool, req)
      if (userId === null) return fail(res, 401, 'unauthorized')

      // ── collection ──
      if (pathname === '/research-project') {
        if (req.method === 'POST') {
          let body
          try {
            body = await readJson(req)
          } catch {
            return fail(res, 400, 'invalid JSON body')
          }
          const name = String(body.name || '').trim()
          if (!name) return fail(res, 400, 'name is required')
          const description = body.description != null ? String(body.description) : null
          const domain = body.domain != null ? String(body.domain) : null
          try {
            const [result] = await pool.query(
              'INSERT INTO research_project (user_id, name, description, domain, created_time) VALUES (?, ?, ?, ?, NOW(6))',
              [userId, name, description, domain],
            )
            const [rows] = await pool.query(
              'SELECT id, user_id, name, description, domain, created_time FROM research_project WHERE id = ?',
              [result.insertId],
            )
            return ok(res, toProjectDto(rows[0]))
          } catch (e) {
            ctx.logger.warn(`[research-project] create error: ${e.message}`)
            return fail(res, 500, `create failed: ${e.message}`)
          }
        }
        if (req.method === 'GET') {
          const qs = new URL(req.url, 'http://localhost').searchParams
          const page = Math.max(0, parseInt(qs.get('page') || '0', 10) || 0)
          const size = Math.max(1, Math.min(100, parseInt(qs.get('size') || '20', 10) || 20))
          try {
            const [rows] = await pool.query(
              'SELECT id, user_id, name, description, domain, created_time FROM research_project WHERE user_id = ? ORDER BY created_time DESC LIMIT ? OFFSET ?',
              [userId, size, page * size],
            )
            const [[{ total }]] = await pool.query(
              'SELECT COUNT(*) AS total FROM research_project WHERE user_id = ?',
              [userId],
            )
            const totalPages = size > 0 ? Math.ceil(total / size) : 0
            return ok(res, { items: rows.map(toProjectDto), page, size, total: Number(total), totalPages })
          } catch (e) {
            ctx.logger.warn(`[research-project] list error: ${e.message}`)
            return fail(res, 500, `list failed: ${e.message}`)
          }
        }
        return fail(res, 405, 'method not allowed')
      }

      // ── item routes: /research-project/:id ──
      const seg = pathname.slice('/research-project/'.length)
      const id = /^\d+$/.test(seg) ? Number(seg) : null
      if (id === null) return fail(res, 404, 'not found')
      if (req.method === 'GET' || req.method === 'DELETE') {
        try {
          // Ownership-enforced lookup (WHERE user_id = ?) — mirrors requireProjectOwnedBy.
          const [rows] = await pool.query(
            'SELECT id, user_id, name, description, domain, created_time FROM research_project WHERE id = ? AND user_id = ?',
            [id, userId],
          )
          if (!rows.length) return fail(res, 404, 'project not found')
          if (req.method === 'GET') return ok(res, toProjectDto(rows[0]))
          await pool.query('DELETE FROM research_project WHERE id = ? AND user_id = ?', [id, userId])
          return ok(res, null)
        } catch (e) {
          ctx.logger.warn(`[research-project] item error: ${e.message}`)
          return fail(res, 500, `operation failed: ${e.message}`)
        }
      }
      return fail(res, 405, 'method not allowed')
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
  })
}

export default { name, inject, apply }
