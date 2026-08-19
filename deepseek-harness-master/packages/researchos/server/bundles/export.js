// Phase 3 research-export: ResearchOS literature export + citation rendering
// bundle running inside dsh. Covers BOTH legacy controllers (ExportController +
// CitationController) since they share the rendering helpers.
//
// Routes (mounted on the dsh webserver, prefix /research-export):
//   GET  /research-export/papers/:id/export/bibtex            -> { bibtex, format }
//   GET  /research-export/papers/:id/export/ris               -> { ris, format }
//   POST /research-export/papers/export/bibtex  { paperIds }  -> { bibtex, format, count }
//   POST /research-export/papers/export/ris     { paperIds }  -> { ris, format, count }
//   GET  /research-export/papers/:id/citation?format=APA|MLA|GB_7714 -> { citation, format }
//   POST /research-export/citation/bibliography { paperIds }?format=APA -> { citations, format, count }
//
// Ownership: single-paper routes require the paper to belong to the user (404
// otherwise). Batch routes filter by user_id (the legacy backend exported any
// paper id without an ownership check — this bundle enforces it, an explicit
// security improvement per AGENTS.md §10.7).
//
// Rendering mirrors backend ExportService/CitationService exactly
// (BibTeX key = first author last name + year; APA/MLA/GB-7714 with the same
// name-inversion rules).
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos@127.0.0.1:3306/researchos)
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
// @module @researchos/dsh-research-export

import jwt from 'jsonwebtoken'
import mysql from 'mysql2/promise'

export const name = 'research-export'

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

// ── rendering (mirror ExportService / CitationService) ─────────────────────

/** "First Last" → "Last, F." (initials from uppercase letters; APA inversion). */
function invertName(fullName) {
  const trimmed = String(fullName).trim()
  const spaceIdx = trimmed.lastIndexOf(' ')
  if (spaceIdx <= 0) return trimmed
  const lastName = trimmed.slice(spaceIdx + 1)
  const firstNames = trimmed.slice(0, spaceIdx)
  let initials = firstNames.replace(/[^A-Z]/g, '')
  if (!initials) initials = firstNames.charAt(0) || ''
  return `${lastName}, ${initials.split('').map((c) => c + '.').join('')}`
}

/** Comma-separated author string -> name list (mirror CitationService.parseAuthors). */
function parseAuthors(authorsStr) {
  if (!authorsStr || !String(authorsStr).trim()) return []
  return String(authorsStr).split(/\s*,\s*/)
}

/** BibTeX key: first author last name + year, alphanumeric only. */
function citationKey(paper) {
  let authorPart = 'unknown'
  let yearPart = paper.year != null ? String(paper.year) : 'nd'
  if (paper.authors && String(paper.authors).trim()) {
    const authors = parseAuthors(paper.authors)
    if (authors.length) {
      const first = authors[0].trim()
      const spaceIdx = first.lastIndexOf(' ')
      authorPart = spaceIdx > 0 ? first.slice(spaceIdx + 1) : first
    }
  }
  const key = (authorPart + yearPart).replace(/[^a-zA-Z0-9]/g, '')
  return key || 'paper'
}

function formatBibtexAuthors(authorsStr) {
  if (!authorsStr || !String(authorsStr).trim()) return 'Anonymous'
  return parseAuthors(authorsStr).map(invertBibtexAuthor).join(' and ')
}

function invertBibtexAuthor(name) {
  const trimmed = String(name).trim()
  const spaceIdx = trimmed.lastIndexOf(' ')
  if (spaceIdx <= 0) return trimmed
  return `${trimmed.slice(spaceIdx + 1)}, ${trimmed.slice(0, spaceIdx)}`
}

function toBibtex(paper) {
  const key = citationKey(paper)
  const authors = formatBibtexAuthors(paper.authors)
  const title = paper.title ? String(paper.title).trim() : 'Untitled'
  const year = paper.year != null ? String(paper.year) : 'n.d.'
  const doi = paper.doi && String(paper.doi).trim() ? String(paper.doi).trim() : ''
  let out = `@article{${key},\n`
  out += `  author = {${authors}},\n`
  out += `  title = {${title}},\n`
  out += `  year = {${year}},\n`
  if (doi) out += `  doi = {${doi}},\n`
  out += '}\n'
  return out
}

function toRis(paper) {
  let out = 'TY  - JOUR\n'
  for (const author of parseAuthors(paper.authors)) out += `AU  - ${author}\n`
  out += `TI  - ${paper.title ? String(paper.title).trim() : 'Untitled'}\n`
  if (paper.year != null) out += `PY  - ${paper.year}\n`
  if (paper.doi && String(paper.doi).trim()) out += `DO  - ${String(paper.doi).trim()}\n`
  out += 'ER  - \n'
  return out
}

// ── citations ──

function formatAuthorsApa(authors) {
  if (!authors.length) return 'Anonymous'
  if (authors.length === 1) return invertName(authors[0])
  if (authors.length === 2) return `${invertName(authors[0])}, & ${invertName(authors[1])}`
  const inverted = authors.map(invertName)
  return `${inverted.slice(0, -1).join(', ')}, & ${inverted[inverted.length - 1]}`
}

function renderApa(paper) {
  const authorPart = formatAuthorsApa(parseAuthors(paper.authors))
  const year = paper.year != null ? String(paper.year) : 'n.d.'
  const title = paper.title ? String(paper.title).trim() : 'Untitled'
  const doi = paper.doi && String(paper.doi).trim() ? ` https://doi.org/${String(paper.doi).trim()}` : ''
  return `${authorPart} (${year}). ${title}.${doi}`
}

function formatAuthorsMla(authors) {
  if (!authors.length) return 'Anonymous.'
  if (authors.length === 1) return `${invertName(authors[0])}.`
  const first = invertName(authors[0])
  const rest = authors.slice(1).join(', ')
  return `${first}, and ${rest}.`
}

function renderMla(paper) {
  const authorPart = formatAuthorsMla(parseAuthors(paper.authors))
  const title = paper.title ? String(paper.title).trim() : 'Untitled'
  const year = paper.year != null ? String(paper.year) : 'n.d.'
  const doi = paper.doi && String(paper.doi).trim() ? ` doi:${String(paper.doi).trim()}` : ''
  return `${authorPart} "${title}." ${year}.${doi}`
}

function formatAuthorsGbt7714(authors) {
  if (!authors.length) return '佚名'
  return `${authors.join(', ')}.`
}

function renderGbt7714(paper) {
  const authorPart = formatAuthorsGbt7714(parseAuthors(paper.authors))
  const title = paper.title ? String(paper.title).trim() : '未命名'
  const year = paper.year != null ? String(paper.year) : 'n.d.'
  return `${authorPart} ${title}[D]. ${year}.`
}

const FORMATS = { APA: renderApa, MLA: renderMla, GB_7714: renderGbt7714 }

function normalizeFormat(raw) {
  const f = String(raw || 'APA').trim().toUpperCase()
  if (f === 'GB7714' || f === 'GB_7714' || f === 'GBT7714') return 'GB_7714'
  return FORMATS[f] ? f : 'APA'
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = mysql.createPool(DB)
  ctx.logger.info(`[research-export] loaded — export/citation over MySQL paper (${DB.user}@${DB.host}:${DB.port}/${DB.database})`)

  const findOwned = (userId, id) =>
    pool.query('SELECT id, title, authors, year, doi FROM paper WHERE id = ? AND user_id = ?', [id, userId]).then((r) => r[0][0] ?? null)

  const findOwnedBatch = async (userId, ids) => {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(',')
    const [rows] = await pool.query(
      `SELECT id, title, authors, year, doi FROM paper WHERE id IN (${placeholders}) AND user_id = ? ORDER BY FIELD(id, ${placeholders})`,
      [...ids, userId, ...ids],
    )
    return rows
  }

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-export',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const pathname = url.pathname.replace(/\/+$/, '')
      const seg = (() => {
        const s = pathname.replace(/^\/research-export\/?/, '')
        return s ? s.split('/') : []
      })()
      const method = req.method

      const userId = await currentUserId(pool, req)
      if (userId === null) return fail(res, 401, 'unauthorized')

      try {
        // single-paper export: GET /papers/:id/export/bibtex|ris
        if (method === 'GET' && seg[0] === 'papers' && seg[1] && seg[2] === 'export' && (seg[3] === 'bibtex' || seg[3] === 'ris')) {
          const paper = await findOwned(userId, Number(seg[1]))
          if (!paper) return fail(res, 404, 'paper not found')
          return seg[3] === 'bibtex'
            ? ok(res, { bibtex: toBibtex(paper), format: 'bibtex' })
            : ok(res, { ris: toRis(paper), format: 'ris' })
        }

        // single-paper citation: GET /papers/:id/citation?format=
        if (method === 'GET' && seg[0] === 'papers' && seg[1] && seg[2] === 'citation') {
          const paper = await findOwned(userId, Number(seg[1]))
          if (!paper) return fail(res, 404, 'paper not found')
          const format = normalizeFormat(url.searchParams.get('format'))
          return ok(res, { citation: FORMATS[format](paper), format })
        }

        // batch export: POST /papers/export/bibtex|ris
        if (method === 'POST' && seg[0] === 'papers' && seg[1] === 'export' && (seg[2] === 'bibtex' || seg[2] === 'ris')) {
          const body = await readJson(req)
          const ids = Array.isArray(body.paperIds) ? body.paperIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []
          const papers = await findOwnedBatch(userId, ids)
          if (seg[2] === 'bibtex') {
            return ok(res, { bibtex: papers.map(toBibtex).join('\n'), format: 'bibtex', count: String(papers.length) })
          }
          return ok(res, { ris: papers.map(toRis).join('\n'), format: 'ris', count: String(papers.length) })
        }

        // bibliography: POST /citation/bibliography?format=
        if (method === 'POST' && seg[0] === 'citation' && seg[1] === 'bibliography') {
          const body = await readJson(req)
          const ids = Array.isArray(body.paperIds) ? body.paperIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []
          const papers = await findOwnedBatch(userId, ids)
          const format = normalizeFormat(url.searchParams.get('format'))
          return ok(res, { citations: papers.map((p) => FORMATS[format](p)), format, count: papers.length })
        }

        return fail(res, 404, 'not found')
      } catch (e) {
        ctx.logger.warn(`[research-export] error: ${e.message}`)
        return fail(res, 500, `operation failed: ${e.message}`)
      }
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
  })
}

export default { name, inject, apply }
