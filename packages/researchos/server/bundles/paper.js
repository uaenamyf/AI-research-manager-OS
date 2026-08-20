// Phase 3 research-paper: ResearchOS paper management bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy Spring Boot PaperController
// exposes, as a dsh bundle talking directly to the MySQL paper table. Every
// query is filtered by user_id (ownership rule) and project_id; auth reuses the
// shared JWT (same JWT_SECRET as research-auth / backend).
//
// Routes (mounted on the dsh webserver, prefix /research-paper):
//   POST   /research-paper/projects/:projectId/papers            { fileName, s3Key, folderId? } -> { id, status } (create + 触发分析)
//   POST   /research-paper/projects/:projectId/papers/import     { doi?, title?, authors?, year?, folderId?, pdfUrl? } -> paper (Crossref enrich + 触发分析 if pdf)
//   POST   /research-paper/projects/:projectId/papers/upload-url -> 501 (dual phase: upload stays on legacy backend)
//   GET    /research-paper/projects/:projectId/papers?folderId=&page=&size= -> PageResponse<listItem> (folderId: null=root, -1=all)
//   GET    /research-paper/papers/:id                            -> paper (detail, incl summary)
//   GET    /research-paper/papers/:id/status                     -> status string
//   GET    /research-paper/papers/:id/card                       -> summary (Paper Intelligence Card)
//   PUT    /research-paper/papers/:paperId/move                  { folderId?, projectId? } (null -> root; projectId 切换项目)
//   PUT    /research-paper/papers/:paperId/reading               { readingStatus?, starRating? }
//   DELETE /research-paper/papers/:id                            -> delete + 触发 chunk cleanup (无 PDF / UPLOADED-only 跳过)
//
// Async contract (2026-08-20 myf: RabbitMQ 已下线，直调 research-ai-worker bundle，
// fire-and-forget HTTP + paper.status 状态机轮询)：
//   POST /research-ai-worker/analyze  { paperId } -> { status: 'PROCESSING' }（后台异步执行）
//   POST /research-ai-worker/cleanup  { paperId } -> { deleted }
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
// @module @researchos/dsh-research-paper

import { createPool } from '../../lib/db.js'
import jwt from 'jsonwebtoken'

export const name = 'research-paper'

export const inject = ['webServer']

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

// 2026-08-20 myf: RabbitMQ 已彻底移除（amqplib / RESEARCH_RABBITMQ_URL 下线）。
// AI 管道由 research-ai-worker bundle 承载：创建/删除论文直接 HTTP 调用
// （X-Internal-Token），fire-and-forget + paper.status 状态机轮询。
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

/** Resolve current user { id } from the shared JWT; null when unauthenticated. */
async function currentUser(pool, req) {
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
  return { id: Number(rows[0].id) }
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
    // 2026-08-20 myf: FAILED 时 ai-worker 把 { error } 写入 summary 字段，
    // 前端导入进度条用它展示失败原因。
    error: row.status === 'FAILED' ? ((parseSummary(row.summary) || {}).error ?? null) : null,
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

/** Call the research-ai-worker bundle over HTTP (X-Internal-Token). */
async function callWorker(action, body) {
  try {
    const res = await fetch(`${GATEWAY}/research-ai-worker/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(`worker ${action} HTTP ${res.status}: ${j.message || ''}`)
    }
    return true
  } catch (e) {
    // 2026-08-19 myf: 临时诊断，调查 cleanup 失败（写到 ctx.logger，dsh 主进程可见）
    try { (globalThis.__researchPaperLogger || ((m) => process.stderr.write('[research-paper:callWorker] ' + m + '\n')))(`failed action=${action} err=${(e && e.message) || String(e)} gw=${GATEWAY}`) } catch {}
    return false
  }
}

/** Trigger paper analysis: fire-and-forget HTTP to research-ai-worker (2026-08-20: MQ removed). */
async function triggerAnalyze(paperId) {
  return callWorker('analyze', { paperId })
}

/** Trigger paper chunk cleanup: HTTP to research-ai-worker. */
async function triggerCleanup(paperId) {
  return callWorker('cleanup', { paperId })
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

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = createPool()
  ctx.logger.info(
    `[research-paper] loaded — paper mgmt over SQLite paper (aiWorker=${GATEWAY}/research-ai-worker)`,
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
              const sent = await triggerAnalyze(result.insertId)
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

        // create: { fileName, s3Key, folderId? } -> { id, status } + 触发分析
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
            const [result] = await pool.query(
              'INSERT INTO paper (project_id, user_id, folder_id, title, pdf_url, status, created_time) VALUES (?, ?, ?, ?, ?, \'PROCESSING\', NOW(6))',
              [projectId, user.id, folderId, fileName, s3Key],
            )
            const sent = await triggerAnalyze(result.insertId)
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
        try {
          // Empty query = recent papers list (used by UI panels to build paper pickers).
          if (!q) {
            const [rows] = await pool.query(
              `SELECT id, project_id, user_id, folder_id, title, authors, year, doi, pdf_url, summary, status, reading_status, star_rating, created_time FROM paper
               WHERE user_id = ? ORDER BY created_time DESC LIMIT ?`,
              [user.id, limit],
            )
            return ok(res, { items: rows.map(toListItem), total: rows.length })
          }
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

          // PUT /papers/:paperId/move { folderId?, projectId? }
          // 2026-08-19 myf: 支持 projectId 字段——跨项目移动时同时切换 project_id；
          // 目标 folder 必须属于目标 project；folderId 缺省视为 null（根目录）。
          if (method === 'PUT' && action === 'move') {
            const body = await readJson(req)
            const targetProjectId = body.projectId == null ? paper.project_id : Number(body.projectId)
            if (!Number.isInteger(targetProjectId) || targetProjectId <= 0) return fail(res, 400, 'invalid projectId')
            // 目标项目必须属于当前用户
            const [ownProj] = await pool.query(
              'SELECT id FROM research_project WHERE id = ? AND user_id = ?',
              [targetProjectId, user.id],
            )
            if (!ownProj.length) return fail(res, 404, 'target project not found')
            const folderId = body.folderId == null ? null : Number(body.folderId)
            if (folderId != null) {
              const [fold] = await pool.query(
                'SELECT id FROM folder WHERE id = ? AND user_id = ? AND project_id = ?',
                [folderId, user.id, targetProjectId],
              )
              if (!fold.length) return fail(res, 404, 'target folder not found')
            }
            await pool.query(
              'UPDATE paper SET folder_id = ?, project_id = ? WHERE id = ? AND user_id = ?',
              [folderId, targetProjectId, paperId, user.id],
            )
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

          // DELETE /papers/:id — 先触发 chunk cleanup，再删行（rollback-safe）。
          // 2026-08-19 myf: 跳过无文件论文（pdf_url 为空 / status=UPLOADED）的 cleanup——
          // 此类论文从未触发 analyze，paper_chunk 里本来就没有记录，cleanup 是 no-op；
          // 直接删 SQLite 行即可。
          if (method === 'DELETE' && action === undefined) {
            try { process.stderr.write(`[research-paper:DELETE] pid=${paperId} status=${paper.status} hasPdf=${!!paper.pdf_url} GATEWAY=${GATEWAY}\n`) } catch {}
            const needsCleanup = !!(paper.pdf_url && paper.status !== 'UPLOADED')
            if (needsCleanup) {
              const sent = await triggerCleanup(paperId)
              try { process.stderr.write(`[research-paper:DELETE] pid=${paperId} sent=${sent}\n`) } catch {}
              if (!sent) return fail(res, 500, 'failed to trigger chunk cleanup')
            } else {
              try { process.stderr.write(`[research-paper:DELETE] pid=${paperId} skip cleanup (no pdf/uploaded-only)\n`) } catch {}
            }
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
  })
}

export default { name, inject, apply }
