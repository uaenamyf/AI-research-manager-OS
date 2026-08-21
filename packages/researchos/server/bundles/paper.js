// Phase 3 research-paper: ResearchOS paper management bundle running inside dsh.
//
// Purpose: serve the SAME wire contract the legacy Spring Boot PaperController
// exposed, as a dsh bundle over a FILESYSTEM paper index (no longer SQLite).
//
// Persistence layout (managed by lib/papers-store.js):
//   ~/.researchos/papers/<projectId>/<paperId>.pdf   (PDF content, always local)
//   ~/.researchos/papers/index.json                  (metadata + status index)
// SQLite keeps research_project, folder, app_user, paper_chunk (vectors).
//
// Routes (mounted on the dsh webserver, prefix /research-paper):
//   POST   /research-paper/projects/:projectId/papers/import     { doi?, title?, authors?, year?, folderId?, pdfUrl? } -> paper
//   POST   /research-paper/projects/:projectId/papers/upload     multipart (file + folderId? + title?) -> paper
//   GET    /research-paper/projects/:projectId/papers?folderId=&page=&size= -> PageResponse<listItem>
//   GET    /research-paper/papers/:id                            -> paper (detail, incl paperCard)
//   GET    /research-paper/papers/:id/status                     -> status string
//   GET    /research-paper/papers/:id/card                       -> paperCard
//   GET    /research-paper/papers/:id/pdf                        -> local PDF bytes (PDF preview; same-origin, no upstream fetch)
//   POST   /research-paper/papers/:id/analyze                    { } -> { status: 'PROCESSING' } (manual trigger — no auto analyze on import)
//   PUT    /research-paper/papers/:paperId/move                  { folderId?, projectId? }
//   PUT    /research-paper/papers/:paperId/reading               { readingStatus?, starRating? }
//   DELETE /research-paper/papers/:id                            -> delete + trigger chunk cleanup
//   GET    /research-paper/search?q=&limit=                      (user-scoped, title/authors/doi LIKE)
//
// Async contract (2026-08-20 myf: RabbitMQ removed, direct HTTP to ai-worker):
//   POST /research-ai-worker/analyze  { paperId } -> { status: 'PROCESSING' }
//   POST /research-ai-worker/cleanup  { paperId } -> { deleted }
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
//
// @module @researchos/dsh-research-paper

import fsp from 'node:fs/promises'
import { createReadStream, statSync } from 'node:fs'
import jwt from 'jsonwebtoken'
import busboy from 'busboy'
import { createPool } from '../../lib/db.js'
import {
  newPaperId,
  localPdfPath,
  ensureProjectDir,
  listProjectPapers,
  listPapers,
  getPaper,
  insertPaper,
  patchPaper,
  deletePaper as deletePaperRecord,
  resolveLocalPdf,
} from '../../lib/papers-store.js'

export const name = 'research-paper'

export const inject = ['webServer']

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

const GATEWAY = (process.env.RESEARCH_GATEWAY_URL || 'http://127.0.0.1:3080').replace(/\/+$/, '')
const INTERNAL_TOKEN = process.env.RESEARCH_INTERNAL_TOKEN || process.env.INTERNAL_TOKEN || 'dev-internal-token'

// ── helpers ────────────────────────────────────────────────────────────────

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}
function ok(res, data) { sendJson(res, 200, { code: 0, message: 'ok', data }) }
function fail(res, status, message) { sendJson(res, status, { code: status, message, data: null }) }
function readJson(req) {
  return new Promise((resolve, reject) => {
    const parts = []
    req.on('data', (c) => parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => {
      try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}) }
      catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
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
async function currentUser(pool, req) {
  const token = extractToken(req)
  if (!token) return null
  let claims
  try { claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) } catch { return null }
  const [rows] = await pool.query('SELECT id FROM app_user WHERE id = ?', [claims.sub])
  if (!rows.length) return null
  return { id: Number(rows[0].id) }
}

function toPaperDto(p) {
  return {
    id: p.id,
    projectId: Number(p.projectId),
    userId: Number(p.userId),
    folderId: p.folderId == null ? null : Number(p.folderId),
    title: p.title,
    authors: p.authors ?? null,
    year: p.year ?? null,
    doi: p.doi ?? null,
    pdfUrl: p.sourceUrl || (p.localPdf ? `/research-paper/papers/${encodeURIComponent(p.id)}/pdf` : null),
    status: p.status,
    readingStatus: p.readingStatus ?? null,
    starRating: p.starRating ?? null,
    createdTime: p.createdTime,
    updatedTime: p.updatedTime,
    summary: p.paperCard ?? null,
    error: p.status === 'FAILED' ? (p.error ?? null) : null,
  }
}
function toListItem(p) {
  return {
    id: p.id,
    title: p.title,
    authors: p.authors ?? null,
    year: p.year ?? null,
    status: p.status,
    folderId: p.folderId == null ? null : Number(p.folderId),
    readingStatus: p.readingStatus ?? null,
    starRating: p.starRating ?? null,
    createdTime: p.createdTime,
  }
}

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
    try { process.stderr.write(`[research-paper:callWorker] failed action=${action} err=${e.message}\n`) } catch {}
    return false
  }
}
async function triggerAnalyze(paperId) { return callWorker('analyze', { paperId }) }
async function triggerCleanup(paperId) { return callWorker('cleanup', { paperId }) }

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
  } catch { return null }
}

/** Download a PDF from an HTTP URL to a local file. Returns bytes written. */
async function downloadPdfToFile(url, dest) {
  const upstreamHost = new URL(url).host
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      accept: 'application/pdf,application/octet-stream,*/*',
      'accept-language': 'en-US,en;q=0.9',
      referer: `https://${upstreamHost}/`,
    },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`pdf download HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!(buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
    throw new Error('downloaded content is not a PDF (no %PDF magic header)')
  }
  await fsp.writeFile(dest, buf)
  return buf.length
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = createPool()
  ctx.logger.info(
    `[research-paper] loaded — filesystem index at ~/.researchos/papers/, ai-worker=${GATEWAY}`,
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

      // ── /research-paper/projects/:projectId/papers/... ──
      if (seg[0] === 'projects' && seg[2] === 'papers') {
        const projectId = Number(seg[1])
        if (!Number.isInteger(projectId) || projectId <= 0) return fail(res, 400, 'invalid project id')
        const [proj] = await pool.query(
          'SELECT id FROM research_project WHERE id = ? AND user_id = ?',
          [projectId, user.id],
        )
        if (!proj.length) return fail(res, 404, 'project not found')

        // import: DOI/title + optional pdfUrl. 不再自动触发分析；状态 UPLOADED。
        if (seg[3] === 'import' && method === 'POST') {
          let body
          try { body = await readJson(req) } catch { return fail(res, 400, 'invalid JSON body') }
          try {
            const doi = String(body.doi || '').trim()
            const meta = doi ? await resolveDoi(doi) : null
            const title = [meta?.title, String(body.title || '')].find((v) => v && String(v).trim()) ?? null
            if (!title) return fail(res, 400, 'title is required')
            const authors = meta?.authors ?? (Array.isArray(body.authors) ? body.authors.join(', ') : body.authors ?? null)
            const year = meta?.year ?? (body.year != null ? Number(body.year) : null)
            const folderId = body.folderId == null ? null : Number(body.folderId)
            const pdfUrl = String(body.pdfUrl || '').trim()
            if (folderId != null) {
              const [fold] = await pool.query('SELECT id FROM folder WHERE id = ? AND user_id = ? AND project_id = ?', [folderId, user.id, projectId])
              if (!fold.length) return fail(res, 404, 'folder not found in this project')
            }
            const id = newPaperId()
            let localRel = null
            let errorMsg = null
            let status = 'UPLOADED'
            if (pdfUrl) {
              try {
                await ensureProjectDir(projectId)
                const abs = localPdfPath(id, projectId)
                const bytes = await downloadPdfToFile(pdfUrl, abs)
                localRel = `${projectId}/${id}.pdf`
                ctx.logger.info(`[research-paper] import: paperId=${id} downloaded ${bytes} bytes from ${pdfUrl}`)
              } catch (e) {
                errorMsg = `pdf download failed: ${e.message}`
                status = 'FAILED'
                ctx.logger.warn(`[research-paper] import download failed: ${e.message}`)
              }
            }
            const stored = await insertPaper({
              id,
              projectId,
              userId: user.id,
              folderId,
              title: String(title).trim(),
              authors,
              year,
              doi: doi || null,
              sourceUrl: pdfUrl || null,
              fileName: null,
              localPdf: localRel,
              status,
              error: errorMsg,
            })
            return ok(res, toPaperDto(stored))
          } catch (e) {
            ctx.logger.warn(`[research-paper] import error: ${e.message}`)
            return fail(res, 500, `import failed: ${e.message}`)
          }
        }

        // upload: 本地 PDF 文件直接导入（multipart）
        if (seg[3] === 'upload' && method === 'POST') {
          const ct = (req.headers['content-type'] || '').toLowerCase()
          if (!ct.includes('multipart/form-data')) return fail(res, 400, 'multipart/form-data required')
          try {
            const result = await new Promise((resolve, reject) => {
              const fields = {}
              let fileBuf = null
              let fileName = null
              const bb = busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024 } })
              bb.on('field', (name, val) => { if (!(name in fields)) fields[name] = val })
              bb.on('file', (_name, stream, info) => {
                fileName = info.filename || 'paper.pdf'
                const chunks = []
                stream.on('data', (c) => chunks.push(c))
                stream.on('end', () => { fileBuf = Buffer.concat(chunks) })
                stream.on('limit', () => reject(new Error('file too large')))
              })
              bb.on('close', () => resolve({ fields, fileBuf, fileName }))
              bb.on('error', reject)
              req.pipe(bb)
            })
            const { fields, fileBuf, fileName } = result
            if (!fileBuf || !fileBuf.length) return fail(res, 400, 'file is required')
            const title = String(fields.title || fileName).trim()
            const folderId = fields.folderId == null || fields.folderId === '' ? null : Number(fields.folderId)
            if (folderId != null) {
              const [fold] = await pool.query('SELECT id FROM folder WHERE id = ? AND user_id = ? AND project_id = ?', [folderId, user.id, projectId])
              if (!fold.length) return fail(res, 404, 'folder not found in this project')
            }
            const id = newPaperId()
            await ensureProjectDir(projectId)
            const abs = localPdfPath(id, projectId)
            await fsp.writeFile(abs, fileBuf)
            const stored = await insertPaper({
              id,
              projectId,
              userId: user.id,
              folderId,
              title,
              authors: null,
              year: null,
              doi: null,
              sourceUrl: null,
              fileName,
              localPdf: `${projectId}/${id}.pdf`,
              status: 'UPLOADED',
              error: null,
            })
            return ok(res, toPaperDto(stored))
          } catch (e) {
            ctx.logger.warn(`[research-paper] upload error: ${e.message}`)
            return fail(res, 500, `upload failed: ${e.message}`)
          }
        }

        // list: GET /projects/:projectId/papers?folderId=&page=&size=
        if (seg[3] === undefined && method === 'GET') {
          const qs = url.searchParams
          const folderIdParam = qs.get('folderId')
          const page = Math.max(0, parseInt(qs.get('page') || '0', 10) || 0)
          const size = Math.max(1, Math.min(100, parseInt(qs.get('size') || '20', 10) || 20))
          try {
            const all = await listProjectPapers(projectId)
            const includeFailed = qs.get('includeFailed') === '1'
            const filtered = all
              .filter((p) => Number(p.userId) === Number(user.id))
              .filter((p) => includeFailed ? true : p.status !== 'FAILED')
              .filter((p) => {
                if (folderIdParam == null || folderIdParam === '') return p.folderId == null
                if (folderIdParam === '-1') return true
                return p.folderId != null && Number(p.folderId) === Number(folderIdParam)
              })
              .sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''))
            const total = filtered.length
            const start = page * size
            const items = filtered.slice(start, start + size).map(toListItem)
            return ok(res, { items, page, size, total, totalPages: Math.ceil(total / size) })
          } catch (e) {
            ctx.logger.warn(`[research-paper] list error: ${e.message}`)
            return fail(res, 500, `list failed: ${e.message}`)
          }
        }
        return fail(res, 405, 'method not allowed')
      }

      // ── /research-paper/search ──
      if (seg[0] === 'search' && method === 'GET') {
        const qs = url.searchParams
        const q = String(qs.get('q') || '').trim()
        const limit = Math.max(1, Math.min(50, parseInt(qs.get('limit') || '20', 10) || 20))
        try {
          const all = await listPapers()
          let matched = all.filter((p) => Number(p.userId) === Number(user.id))
          if (q) {
            const lower = q.toLowerCase()
            matched = matched.filter((p) =>
              (p.title || '').toLowerCase().includes(lower) ||
              (p.authors || '').toLowerCase().includes(lower) ||
              (p.doi || '').toLowerCase().includes(lower)
            )
          }
          matched.sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''))
          return ok(res, { items: matched.slice(0, limit).map(toListItem), total: matched.length })
        } catch (e) {
          ctx.logger.warn(`[research-paper] search error: ${e.message}`)
          return fail(res, 500, `search failed: ${e.message}`)
        }
      }

      // ── /research-paper/papers/:id/... ──
      if (seg[0] === 'papers' && seg[1]) {
        const paperId = seg[1]
        const action = seg[2]
        try {
          const paper = await getPaper(paperId)
          if (!paper) return fail(res, 404, 'paper not found')
          if (Number(paper.userId) !== Number(user.id)) return fail(res, 404, 'paper not found')

          if (method === 'GET' && action === undefined) return ok(res, toPaperDto(paper))
          if (method === 'GET' && action === 'status') return ok(res, paper.status)
          if (method === 'GET' && action === 'card') return ok(res, paper.paperCard || null)
          if (method === 'GET' && action === 'pdf') {
            const abs = await resolveLocalPdf(paperId)
            if (!abs) return fail(res, 404, 'local pdf missing')
            try {
              const stat = statSync(abs)
              res.writeHead(200, {
                'content-type': 'application/pdf',
                'content-length': stat.size,
                'content-disposition': 'inline',
                'cache-control': 'public, max-age=3600',
              })
              createReadStream(abs).pipe(res)
              return
            } catch (e) {
              return fail(res, 500, `read failed: ${e.message}`)
            }
          }

          // POST /papers/:id/analyze — 手动触发 AI 解析
          if (method === 'POST' && action === 'analyze') {
            const abs = await resolveLocalPdf(paperId)
            if (!abs) return fail(res, 400, 'local pdf missing — re-import the paper first')
            await patchPaper(paperId, { status: 'PROCESSING', error: null })
            const sent = await triggerAnalyze(paperId)
            if (!sent) {
              await patchPaper(paperId, { status: 'FAILED', error: 'failed to trigger AI analysis' })
              return fail(res, 500, 'failed to trigger AI analysis')
            }
            return ok(res, { id: paperId, status: 'PROCESSING' })
          }

          // PUT /papers/:id/move
          if (method === 'PUT' && action === 'move') {
            const body = await readJson(req)
            const targetProjectId = body.projectId == null ? paper.projectId : Number(body.projectId)
            if (!Number.isInteger(targetProjectId) || targetProjectId <= 0) return fail(res, 400, 'invalid projectId')
            const [ownProj] = await pool.query('SELECT id FROM research_project WHERE id = ? AND user_id = ?', [targetProjectId, user.id])
            if (!ownProj.length) return fail(res, 404, 'target project not found')
            const folderId = body.folderId == null ? null : Number(body.folderId)
            if (folderId != null) {
              const [fold] = await pool.query('SELECT id FROM folder WHERE id = ? AND user_id = ? AND project_id = ?', [folderId, user.id, targetProjectId])
              if (!fold.length) return fail(res, 404, 'target folder not found')
            }
            if (Number(targetProjectId) !== Number(paper.projectId)) {
              const oldAbs = await resolveLocalPdf(paperId)
              if (oldAbs) {
                await ensureProjectDir(targetProjectId)
                const newAbs = localPdfPath(paperId, targetProjectId)
                try {
                  await fsp.rename(oldAbs, newAbs)
                } catch (e) {
                  if (e.code === 'EXDEV') {
                    await fsp.copyFile(oldAbs, newAbs)
                    await fsp.unlink(oldAbs).catch(() => {})
                  } else { throw e }
                }
              }
            }
            await patchPaper(paperId, { projectId: targetProjectId, folderId })
            return ok(res, null)
          }

          // PUT /papers/:id/reading
          if (method === 'PUT' && action === 'reading') {
            const body = await readJson(req)
            const patch = {}
            if (Object.prototype.hasOwnProperty.call(body, 'readingStatus')) {
              patch.readingStatus = body.readingStatus == null ? null : String(body.readingStatus)
            }
            if (Object.prototype.hasOwnProperty.call(body, 'starRating')) {
              patch.starRating = body.starRating == null ? null : Number(body.starRating)
            }
            if (!Object.keys(patch).length) return fail(res, 400, 'nothing to update')
            await patchPaper(paperId, patch)
            return ok(res, null)
          }

          // DELETE /papers/:id
          if (method === 'DELETE' && action === undefined) {
            if (paper.status === 'READY' || paper.status === 'FAILED') {
              const sent = await triggerCleanup(paperId)
              if (!sent) return fail(res, 500, 'failed to trigger chunk cleanup')
            }
            await deletePaperRecord(paperId)
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
