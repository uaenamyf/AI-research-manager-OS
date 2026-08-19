// Phase 5+ research-external-search: REST wrapper over the standalone
// literature-search-mcp (mcp/literature-search-mcp) multi-source online
// literature search. The stdio MCP server is agent-only (a browser UI cannot
// call it), so this bundle reuses its LiteratureSearchService — the exact same
// provider set (PubMed / EuropePMC / Crossref / OpenAlex / Semantic Scholar /
// arXiv / bioRxiv) — and exposes it as a plain HTTP endpoint the research-area
// 文献检索 search box calls directly.
//
// Routes (mounted on the dsh webserver, prefix /research-external-search):
//   GET /research-external-search?q=&limit=&title=&author=&doi=&year_from=&year_to=&open_access=
//     -> aggregated results (JWT required)
//   Query params:
//     q            free-text keyword across title/abstract (optional)
//     title        exact title phrase (quoted when combined)
//     author       author name phrase (quoted when combined)
//     doi          DOI string (sent verbatim; most providers resolve it)
//     year_from / year_to   publication year range filter
//     open_access  '1'/'true' -> only open-access results
//     limit        max results (1..50, default 10)
//
// Auth: shared JWT (same JWT_SECRET as research-auth / backend). No user data
// is read — external search is public data, but the endpoint stays behind the
// same login gate for consistency with the rest of the research area.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   JWT_SECRET  (shared with backend; fallback = backend yml default)
// @module @researchos/dsh-research-external-search

import jwt from 'jsonwebtoken'
import { LiteratureSearchService } from '../../mcp/literature-search-mcp/dist/service.js'
import { HttpClient } from '../../mcp/literature-search-mcp/dist/http.js'

export const name = 'research-external-search'

export const inject = ['webServer']

// Same secret as research-auth / Spring Boot JwtTokenProvider.
const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

// Providers are stateless; HttpClient keeps a small result cache, so a single
// instance is safe for concurrent requests and reuses the cache. Short timeout
// + single retry: a throttled provider (e.g. arXiv 429) would otherwise keep
// the whole aggregation hanging for minutes (3 retries × 30s default).
const service = new LiteratureSearchService({
  http: new HttpClient({ timeoutMs: 10_000, retries: 1 }),
})

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

function authenticated(req) {
  const token = extractToken(req)
  if (!token) return false
  try {
    jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

// Same-origin PDF proxy: upstream hosts (Wiley, EuropePMC, ...) send
// X-Frame-Options / CSP frame-ancestors that refuse direct <iframe> embedding,
// so the browser's built-in PDF viewer can never render them. Fetching the
// PDF server-side and re-serving it as application/pdf from our own origin
// makes the iframe work. Buffered (not streamed): PDFs are typically a few MB,
// and buffering sidesteps chunked-write interruptions on the dsh webserver.
const MAX_PDF_BYTES = 50 * 1024 * 1024
async function proxyPdf(ctx, res, url) {
  const target = String(url.searchParams.get('url') || '').trim()
  if (!target || !/^https?:\/\//i.test(target)) {
    return sendJson(res, 400, { code: 400, message: 'url is required', data: null })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const upstreamHost = new URL(target).host
    const upstream = await fetch(target, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'application/pdf,application/octet-stream,*/*',
        'accept-language': 'en-US,en;q=0.9',
        referer: `https://${upstreamHost}/`,
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!upstream.ok) {
      return sendJson(res, 502, { code: 502, message: `upstream ${upstream.status}`, data: null })
    }
    const ctype = upstream.headers.get('content-type') || ''
    const body = Buffer.from(await upstream.arrayBuffer())
    if (body.length > MAX_PDF_BYTES) {
      return sendJson(res, 502, { code: 502, message: 'pdf too large', data: null })
    }
    // Even if the upstream replied HTML (login wall / error page), serve it
    // with the upstream content-type; the iframe then shows that page rather
    // than a blank viewer. A PDF magic header means we can force application/pdf.
    const looksPdf = body.length >= 5 && body[0] === 0x25 && body[1] === 0x50 && body[2] === 0x44 && body[3] === 0x46
    res.writeHead(200, {
      'content-type': looksPdf ? 'application/pdf' : /pdf|octet-stream/i.test(ctype) ? 'application/pdf' : 'text/html; charset=utf-8',
      'content-length': body.length,
      'content-disposition': 'inline',
      'cache-control': 'public, max-age=3600',
    })
    res.end(body)
  } catch (e) {
    ctx.logger.warn(`[research-external-search] pdf proxy error: ${e.message}`)
    if (!res.headersSent) return sendJson(res, 502, { code: 502, message: `pdf proxy failed: ${e.message}`, data: null })
    res.destroy()
  } finally {
    clearTimeout(timer)
  }
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  ctx.logger.info(
    '[research-external-search] loaded — online multi-source literature search (PubMed/EuropePMC/Crossref/OpenAlex/SemanticScholar/arXiv/bioRxiv)',
  )

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-external-search',
    handler: async (req, res) => {
      if (!authenticated(req)) return fail(res, 401, 'unauthorized')
      const url = new URL(req.url, 'http://localhost')
      const path = url.pathname.replace(/\/+$/, '')
      // PDF proxy sub-route (prefix may or may not be stripped from req.url).
      if (path === '/research-external-search/pdf' || path === '/pdf') {
        return proxyPdf(ctx, res, url)
      }
      if (req.method !== 'GET') return fail(res, 405, 'method not allowed')

      const q = String(url.searchParams.get('q') || '').trim()
      const title = String(url.searchParams.get('title') || '').trim()
      const author = String(url.searchParams.get('author') || '').trim()
      const doi = String(url.searchParams.get('doi') || '').trim()
      const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10) || 10))
      const yearFrom = parseInt(url.searchParams.get('year_from') || '', 10)
      const yearTo = parseInt(url.searchParams.get('year_to') || '', 10)
      const openAccess = ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('open_access') || '').toLowerCase())

      // Compose the provider query: exact title/author stay quoted phrases,
      // DOI is sent verbatim (most providers resolve it), free keyword last.
      // Year range / open-access go through the shared common filters.
      const parts = []
      if (title) parts.push(`"${title}"`)
      if (author) parts.push(`"${author}"`)
      if (doi) parts.push(doi)
      if (q) parts.push(q)
      if (parts.length === 0) return fail(res, 400, 'q/title/author/doi is required')

      try {
        const result = await service.search({
          query: parts.join(' '),
          limit,
          year_from: Number.isFinite(yearFrom) ? yearFrom : undefined,
          year_to: Number.isFinite(yearTo) ? yearTo : undefined,
          open_access: openAccess || undefined,
        })
        // Flatten to a lighter wire shape the UI renders directly.
        return ok(res, {
          query: result.query,
          filters: {
            q,
            title,
            author,
            doi,
            year_from: Number.isFinite(yearFrom) ? yearFrom : null,
            year_to: Number.isFinite(yearTo) ? yearTo : null,
            open_access: openAccess,
          },
          returned: result.returned,
          source_statuses: result.source_statuses,
          results: result.results.map((p) => ({
            // LiteratureResult has no top-level `source`; the primary source
            // is the rank-0 entry of source_evidence.
            source: p.source_evidence?.[0]?.source ?? null,
            source_id: p.source_id,
            title: p.title,
            abstract: p.abstract ?? null,
            year: p.year ?? null,
            authors: Array.isArray(p.authors) ? p.authors : [],
            venue: p.venue ?? null,
            doi: p.identifiers?.doi ?? null,
            pmid: p.identifiers?.pmid ?? null,
            url: p.url ?? null,
            pdf_url: p.pdf_url ?? null,
            open_access: p.open_access ?? false,
          })),
        })
      } catch (e) {
        ctx.logger.warn(`[research-external-search] search error: ${e.message}`)
        return fail(res, 502, `external search failed: ${e.message}`)
      }
    },
  })
}

export default { name, inject, apply }
