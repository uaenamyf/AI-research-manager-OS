// Phase 3 research-paper: ResearchOS paper management bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy Spring Boot PaperController
// exposes, as a dsh bundle talking directly to the MySQL paper table. Every
// query is filtered by user_id (ownership rule) and project_id; auth reuses the
// shared JWT (same JWT_SECRET as research-auth / backend).
//
// Routes (mounted on the dsh webserver, prefix /research-paper):
//   POST   /research-paper/projects/:projectId/papers            { fileName, s3Key, folderId? } -> { id, status } (create + MQ paper.analyze)
//   POST   /research-paper/projects/:projectId/papers/import     { doi?, title?, authors?, year?, folderId?, pdfUrl? } -> paper (Crossref enrich + MQ if pdf)
//   POST   /research-paper/projects/:projectId/papers/upload-url -> 501 (dual phase: upload stays on legacy backend)
//   GET    /research-paper/projects/:projectId/papers?folderId=&page=&size= -> PageResponse<listItem> (folderId: null=root, -1=all)
//   GET    /research-paper/papers/:id                            -> paper (detail, incl summary)
//   GET    /research-paper/papers/:id/status                     -> status string
//   GET    /research-paper/papers/:id/card                       -> summary (Paper Intelligence Card)
//   PUT    /research-paper/papers/:paperId/move                  { folderId }  (null -> root)
//   PUT    /research-paper/papers/:paperId/reading               { readingStatus?, starRating? }
//   DELETE /research-paper/papers/:id                            -> delete + MQ paper.delete
//
// Async contract (mirror backend -> ai-service, see Implementation/70-async-mq.md):
//   publish exchange "researchos.ai.task" routing "paper.analyze"/"paper.delete",
//   message { taskId, type: PAPER_ANALYSIS|PAPER_DELETE, payload: { paperId, pdfUrl? } }.
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos@127.0.0.1:3306/researchos)
//   RESEARCH_RABBITMQ_URL  (default amqp://guest:guest@127.0.0.1:5672)
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
//   ENFORCE_QUOTA     ("true" enables monthly upload quota, default off, mirrors backend dev switch)
// @module @researchos/dsh-research-paper

import mysql from 'mysql2/promise'
import jwt from 'jsonwebtoken'
import amqplib from 'amqplib'

export const name = 'research-paper'

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

// Mirrors backend SubscriptionService (ENFORCE_QUOTA switch, dev default off).
const ENFORCE_QUOTA = process.env.ENFORCE_QUOTA === 'true'
const PLAN_LIMITS = { FREE: 10, PRO: 500, RESEARCHER: Number.MAX_SAFE_INTEGER }

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

function failCode(res, httpStatus, code, message) {
  sendJson(res, httpStatus, { code, message, data: null })
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

/** Resolve current user { id, plan } from the shared JWT; null when unauthenticated. */
async function currentUser(pool, req) {
  const token = extractToken(req)
  if (!token) return null
  let claims
  try {
    claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return null
  }
  const [rows] = await pool.query('SELECT id, plan FROM app_user WHERE id = ?', [claims.sub])
  if (!rows.length) return null
  return { id: Number(rows[0].id), plan: rows[0].plan }
}

function normTime(v) {
  if (v instanceof Date) return v.toISOString()
  return v ? String(v).replace(' ', 'T') : null
}

function parseSummary(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return raw
}

function toPaperDto(row) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    userId: Number(row.user_id),
    folderId: row.folder_id == null ? null : Number(row.folder_id),
    title: row.title,
    authors: row.authors ?? null,
    year: row.year ?? null,
    doi: row.doi ?? null,
    pdfUrl: row.pdf_url,
    status: row.status,
    readingStatus: row.reading_status ?? null,
    starRating: row.star_rating ?? null,
    createdTime: normTime(row.created_time),
    summary: parseSummary(row.summary),
  }
}

function toListItem(row) {
  return {
    id: Number(row.id),
    title: row.title,
    authors: row.authors ?? null,
    year: row.year ?? null,
    status: row.status,
    folderId: row.folder_id == null ? null : Number(row.folder_id),
    readingStatus: row.reading_status ?? null,
    starRating: row.star_rating ?? null,
    createdTime: normTime(row.created_time),
  }
}

async function findOwnedPaper(pool, userId, paperId) {
  const [rows] = await pool.query(
    'SELECT id, project_id, user_id, folder_id, title, authors, year, doi, pdf_url, summary, status, reading_status, star_rating, created_time FROM paper WHERE id = ? AND user_id = ?',
    [paperId, userId],
  )
  return rows[0] ?? null
}

/** Publish an AI task to the shared RabbitMQ exchange; returns true on success. */
let mqConn = null
async function publishTask(taskId, type, payload) {
  try {
    if (!mqConn) mqConn = await amqplib.connect(MQ_URL)
    const ch = await mqConn.createChannel()
    const routing = type === 'PAPER_DELETE' ? 'paper.delete' : 'paper.analyze'
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

/** Crossref metadata resolution, graceful fallback (mirror CrossrefService.resolve). */
async function resolveDoi(doi) {
  try {
    const resp = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return null
    const j = await resp.json()
    const m = j.message || {}
    const title = Array.isArray(m.title) ? m.title[0] : null
    const authors = Array.isArray(m.author)
      ? m.author.map((a) => [a.family, a.given].filter(Boolean).join(', ')).join(', ') || null
      : null
    const year = m.issued?.['date-parts']?.[0]?.[0] ?? null
    return { title, authors, year: year != null ? Number(year) : null }
  } catch {
    return null
  }
}

/** Monthly upload quota (mirror SubscriptionService.checkQuota). */
async function checkQuota(pool, userId, plan) {
  if (!ENFORCE_QUOTA) return true
  const limit = PLAN_LIMITS[plan] ?? 10
  if (limit === Number.MAX_SAFE_INTEGER) return true
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01 00:00:00`
  const [[{ cnt }]] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM paper WHERE user_id = ? AND created_time >= ?',
    [userId, monthStart],
  )
  return Number(cnt) < limit
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = mysql.createPool(DB)
  ctx.logger.info(
    `[research-paper] loaded — paper mgmt over MySQL paper (${DB.user}@${DB.host}:${DB.port}/${DB.database}), MQ=${MQ_EXCHANGE}, enforceQuota=${ENFORCE_QUOTA}`,
  )

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-paper',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const pathname = url.pathname.replace(/\/+$/, '')
      const user = await currentUser(pool, req)
      if (user === null) return fail(res, 401, 'unauthorized')

      const seg = (() => {
        const s = pathname.replace(/^\/research-paper\/?/, '')
        return s ? s.split('/') : []
      })()
      const method = req.method

      // ── projects/:projectId/papers[...] ──
      if (seg[0] === 'projects' && seg[2] === 'papers') {
        const projectId = Number(seg[1])
        if (!Number.isInteger(projectId) || projectId <= 0) return fail(res, 400, 'invalid project id')
        // Project ownership gate (mirror requireProjectOwnedBy).
        const [proj] = await pool.query('SELECT id FROM research_project WHERE id = ? AND user_id = ?', [projectId, user.id])
        if (!proj.length) return fail(res, 404, 'project not found')

        // upload-url: dual phase — upload still flows through the legacy backend.
        if (seg[3] === 'upload-url' && method === 'POST') {
          return failCode(res, 501, 501, 'upload-url is served by the legacy backend during the dual phase; create the paper record after uploading there')
        }

        // import: DOI/title + optional pdfUrl.
        if (seg[3] === 'import' && method === 'POST') {
          let body
          try {
            body = await readJson(req)
          } catch {
            return fail(res, 400, 'invalid JSON body')
          }
          try {
            if (!(await checkQuota(pool, user.id, user.plan))) {
              return failCode(res, 400, 3005, 'Free quota exceeded, please upgrade your subscription')
            }
            const doi = String(body.doi || '').trim()
            const meta = doi ? await resolveDoi(doi) : null
            const title = [meta?.title, String(body.title || '')].find((v) => v && String(v).trim()) ?? null
            if (!title) return fail(res, 400, 'title is required')
            const authors = meta?.authors ?? (Array.isArray(body.authors) ? body.authors.join(', ') : body.authors ?? null)
            const year = meta?.year ?? (body.year != null ? Number(body.year) : null)
            const folderId = body.folderId == null ? null : Number(body.folderId)
            const pdfUrl = String(body.pdfUrl || '').trim()
            const status = pdfUrl ? 'PROCESSING' : 'UPLOADED'
            const [result] = await pool.query(
              'INSERT INTO paper (project_id, user_id, folder_id, title, authors, year, doi, pdf_url, status, created_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))',
              [projectId, user.id, folderId, String(title).trim(), authors, year, doi || null, pdfUrl, status],
            )
            if (pdfUrl) {
              const sent = await publishTask(result.insertId, 'PAPER_ANALYSIS', { paperId: result.insertId, pdfUrl })
              if (!sent) {
                await pool.query('DELETE FROM paper WHERE id = ?', [result.insertId])
                return fail(res, 500, 'failed to trigger AI analysis')
              }
            }
            const fresh = await findOwnedPaper(pool, user.id, result.insertId)
            return ok(res, toPaperDto(fresh))
          } catch (e) {
            ctx.logger.warn(`[research-paper] import error: ${e.message}`)
            return fail(res, 500, `import failed: ${e.message}`)
          }
        }

        // create: { fileName, s3Key, folderId? } -> { id, status } + MQ paper.analyze
        if (seg[3] === undefined && method === 'POST') {
          let body
          try {
            body = await readJson(req)
          } catch {
            return fail(res, 400, 'invalid JSON body')
          }
          const fileName = String(body.fileName || body.title || '').trim()
          const s3Key = String(body.s3Key || body.pdfUrl || '').trim()
          if (!fileName) return fail(res, 400, 'fileName is required')
          if (!s3Key) return fail(res, 400, 's3Key is required')
          const folderId = body.folderId == null ? null : Number(body.folderId)
          try {
            if (!(await checkQuota(pool, user.id, user.plan))) {
              return failCode(res, 400, 3005, 'Free quota exceeded, please upgrade your subscription')
            }
            const [result] = await pool.query(
              'INSERT INTO paper (project_id, user_id, folder_id, title, pdf_url, status, created_time) VALUES (?, ?, ?, ?, ?, \'PROCESSING\', NOW(6))',
              [projectId, user.id, folderId, fileName, s3Key],
            )
            const sent = await publishTask(result.insertId, 'PAPER_ANALYSIS', { paperId: result.insertId, pdfUrl: s3Key })
            if (!sent) {
              await pool.query('DELETE FROM paper WHERE id = ?', [result.insertId])
              return fail(res, 500, 'failed to trigger AI analysis')
            }
            return ok(res, { id: result.insertId, status: 'PROCESSING' })
          } catch (e) {
            ctx.logger.warn(`[research-paper] create error: ${e.message}`)
            return fail(res, 500, `create failed: ${e.message}`)
          }
        }

        // list: GET /projects/:projectId/papers?folderId=&page=&size=
        if (seg[3] === undefined && method === 'GET') {
          const qs = url.searchParams
          const folderIdParam = qs.get('folderId')
          const page = Math.max(0, parseInt(qs.get('page') || '0', 10) || 0)
          const size = Math.max(1, Math.min(100, parseInt(qs.get('size') || '20', 10) || 20))
          try {
            const where = ['project_id = ?', 'user_id = ?']
            const params = [projectId, user.id]
            if (folderIdParam == null || folderIdParam === '') {
              where.push('folder_id IS NULL')
            } else if (folderIdParam !== '-1') {
              where.push('folder_id = ?')
              params.push(Number(folderIdParam))
            }
            const [rows] = await pool.query(
              `SELECT id, project_id, user_id, folder_id, title, authors, year, doi, pdf_url, summary, status, reading_status, star_rating, created_time FROM paper WHERE ${where.join(' AND ')} ORDER BY created_time DESC LIMIT ? OFFSET ?`,
              [...params, size, page * size],
            )
            const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM paper WHERE ${where.join(' AND ')}`, params)
            const totalPages = size > 0 ? Math.ceil(Number(total) / size) : 0
            return ok(res, { items: rows.map(toListItem), page, size, total: Number(total), totalPages })
          } catch (e) {
            ctx.logger.warn(`[research-paper] list error: ${e.message}`)
            return fail(res, 500, `list failed: ${e.message}`)
          }
        }
        return fail(res, 405, 'method not allowed')
      }

      // ── search: GET /research-paper/search?q=&limit= (user-scoped, title/authors/doi LIKE) ──
      if (seg[0] === 'search' && method === 'GET') {
        const qs = url.searchParams
        const q = String(qs.get('q') || '').trim()
        const limit = Math.max(1, Math.min(50, parseInt(qs.get('limit') || '20', 10) || 20))
        if (!q) return ok(res, { items: [], total: 0 })
        try {
          const like = `%${q}%`
          const [rows] = await pool.query(
            `SELECT id, project_id, user_id, folder_id, title, authors, year, doi, pdf_url, summary, status, reading_status, star_rating, created_time FROM paper
             WHERE user_id = ? AND (title LIKE ? OR authors LIKE ? OR doi LIKE ?)
             ORDER BY created_time DESC LIMIT ?`,
            [user.id, like, like, like, limit],
          )
          return ok(res, { items: rows.map(toListItem), total: rows.length })
        } catch (e) {
          ctx.logger.warn(`[research-paper] search error: ${e.message}`)
          return fail(res, 500, `search failed: ${e.message}`)
        }
      }

      // ── papers/:id[...] ──
      if (seg[0] === 'papers' && seg[1]) {
        const paperId = Number(seg[1])
        if (!Number.isInteger(paperId) || paperId <= 0) return fail(res, 404, 'paper not found')
        const action = seg[2]
        try {
          const paper = await findOwnedPaper(pool, user.id, paperId)
          if (!paper) return fail(res, 404, 'paper not found')

          // GET /papers/:id
          if (method === 'GET' && action === undefined) return ok(res, toPaperDto(paper))
          // GET /papers/:id/status
          if (method === 'GET' && action === 'status') return ok(res, paper.status)
          // GET /papers/:id/card
          if (method === 'GET' && action === 'card') return ok(res, parseSummary(paper.summary))

          // PUT /papers/:paperId/move { folderId } — explicit SET so null moves back to root.
          if (method === 'PUT' && action === 'move') {
            const body = await readJson(req)
            const folderId = body.folderId == null ? null : Number(body.folderId)
            if (folderId != null) {
              const [fold] = await pool.query(
                'SELECT id FROM folder WHERE id = ? AND user_id = ? AND project_id = ?',
                [folderId, user.id, paper.project_id],
              )
              if (!fold.length) return fail(res, 404, 'target folder not found')
            }
            await pool.query('UPDATE paper SET folder_id = ? WHERE id = ? AND user_id = ?', [folderId, paperId, user.id])
            return ok(res, null)
          }

          // PUT /papers/:paperId/reading { readingStatus?, starRating? }
          if (method === 'PUT' && action === 'reading') {
            const body = await readJson(req)
            const sets = []
            const params = []
            if (Object.prototype.hasOwnProperty.call(body, 'readingStatus')) {
              sets.push('reading_status = ?')
              params.push(body.readingStatus == null ? null : String(body.readingStatus))
            }
            if (Object.prototype.hasOwnProperty.call(body, 'starRating')) {
              sets.push('star_rating = ?')
              const star = body.starRating
              params.push(star == null ? null : Number(star))
            }
            if (!sets.length) return fail(res, 400, 'nothing to update')
            await pool.query(`UPDATE paper SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [...params, paperId, user.id])
            return ok(res, null)
          }

          // DELETE /papers/:id — publish paper.delete FIRST, then delete the row (rollback-safe).
          if (method === 'DELETE' && action === undefined) {
            const sent = await publishTask(paperId, 'PAPER_DELETE', { paperId })
            if (!sent) return fail(res, 500, 'failed to publish cleanup task')
            await pool.query('DELETE FROM paper WHERE id = ? AND user_id = ?', [paperId, user.id])
            return ok(res, null)
          }

          return fail(res, 405, 'method not allowed')
        } catch (e) {
          ctx.logger.warn(`[research-paper] item error: ${e.message}`)
          return fail(res, 500, `operation failed: ${e.message}`)
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
