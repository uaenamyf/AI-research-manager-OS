// Phase 3 research-file: ResearchOS file storage bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy Spring Boot FileController +
// LocalStorageService expose, as a dsh-native bundle storing files in a local
// directory (RESEARCH_STORAGE_LOCAL_DIR). Key layout mirrors the backend:
//   papers/{uuid}/{fileName}
// One-time upload tokens are held in-process (like the backend's map).
//
// Routes (mounted on the dsh webserver, prefix /research-file):
//   POST   /research-file/upload-url            { fileName, contentType } -> { url, fields: { key } }  (JWT)
//   POST   /research-file/local-upload/:token   multipart (file + key)    -> { key }                    (JWT + one-time token)
//   GET    /research-file/files/{key...}        full or Range download    -> local                      (JWT or X-Internal-Token)
//   DELETE /research-file/files/{key...}        delete local file         -> ok                          (JWT)
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_STORAGE_LOCAL_DIR   (default ~/.researchos/uploads)
//   RESEARCH_INTERNAL_TOKEN      (shared X-Internal-Token, fallback INTERNAL_TOKEN / dev-internal-token)
//   JWT_SECRET                   (shared with backend; fallback = backend yml default)
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE (for the user-existence auth check)
// @module @researchos/dsh-research-file

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import busboy from 'busboy'
import jwt from 'jsonwebtoken'
import { createPool } from '../../lib/db.js'

export const name = 'research-file'

export const inject = ['webServer']

const UPLOAD_DIR = path.resolve(process.env.RESEARCH_STORAGE_LOCAL_DIR || path.join(os.homedir(), '.researchos', 'uploads'))
const INTERNAL_TOKEN =
  process.env.RESEARCH_INTERNAL_TOKEN || process.env.INTERNAL_TOKEN || 'dev-internal-token'

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

const DB = {
  host: process.env.RESEARCH_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.RESEARCH_MYSQL_PORT || 3306),
  user: process.env.RESEARCH_MYSQL_USER || 'researchos',
  password: process.env.RESEARCH_MYSQL_PASSWORD || 'researchos',
  database: process.env.RESEARCH_MYSQL_DATABASE || 'researchos',
}

// One-time upload tokens: token -> storage key (in-process, mirrors LocalStorageService).
const tokenToKey = new Map()

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

/** JWT user id with app_user existence check (mirror JwtAuthFilter); null when not authenticated. */
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

function isInternal(req) {
  return req.headers['x-internal-token'] === INTERNAL_TOKEN
}

/** Resolve a storage key to a safe absolute path under UPLOAD_DIR; null when unsafe. */
function resolveKey(key) {
  if (!key || typeof key !== 'string') return null
  if (key.includes('\0')) return null
  const root = path.resolve(UPLOAD_DIR)
  const p = path.resolve(root, key)
  if (p !== root && !p.startsWith(root + path.sep)) return null
  return p
}

/** Parse multipart body; resolves { fileBuf, keyField }. */
function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: 200 * 1024 * 1024 },
    })
    let fileBuf = null
    let keyField = null
    bb.on('field', (name, val) => {
      if (name === 'key') keyField = val
    })
    bb.on('file', (name, stream) => {
      const chunks = []
      stream.on('data', (c) => chunks.push(c))
      stream.on('end', () => {
        fileBuf = Buffer.concat(chunks)
      })
      stream.on('error', reject)
    })
    bb.on('close', () => resolve({ fileBuf, keyField }))
    bb.on('error', reject)
    req.pipe(bb)
  })
}

function serveLocal(res, filePath, key, rangeHeader) {
  const stat = fs.statSync(filePath)
  const fileName = encodeURIComponent(key.split('/').pop())
  const base = {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${fileName}"`,
    'accept-ranges': 'bytes',
  }
  if (!rangeHeader) {
    res.writeHead(200, { ...base, 'content-length': stat.size })
    fs.createReadStream(filePath).pipe(res)
    return
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!m || (m[1] === '' && m[2] === '')) {
    res.writeHead(416, { 'content-range': `bytes */${stat.size}` })
    res.end()
    return
  }
  const start = m[1] === '' ? Math.max(0, stat.size - Number(m[2])) : Number(m[1])
  const end = m[2] === '' ? stat.size - 1 : Math.min(Number(m[2]), stat.size - 1)
  if (start > end || start >= stat.size) {
    res.writeHead(416, { 'content-range': `bytes */${stat.size}` })
    res.end()
    return
  }
  const len = end - start + 1
  res.writeHead(206, {
    ...base,
    'content-range': `bytes ${start}-${end}/${stat.size}`,
    'content-length': len,
  })
  fs.createReadStream(filePath, { start, end }).pipe(res)
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = createPool()
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  ctx.logger.info(
    `[research-file] loaded — local file storage at ${UPLOAD_DIR}`,
  )

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-file',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const pathname = url.pathname.replace(/\/+$/, '')
      const seg = (() => {
        const s = pathname.replace(/^\/research-file\/?/, '')
        return s ? s.split('/') : []
      })()
      const method = req.method

      // POST /research-file/upload-url — presign (JWT required, mirrors backend auth).
      if (method === 'POST' && seg[0] === 'upload-url') {
        const userId = await currentUserId(pool, req)
        if (userId === null) return fail(res, 401, 'unauthorized')
        let body
        try {
          body = JSON.parse(await readRaw(req))
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const fileName = String(body.fileName || '').trim()
        if (!fileName) return fail(res, 400, 'fileName is required')
        const key = `papers/${randomUUID()}/${fileName}`
        const token = randomUUID()
        tokenToKey.set(token, key)
        const host = req.headers.host || '127.0.0.1:3081'
        return ok(res, { url: `http://${host}/research-file/local-upload/${token}`, fields: { key } })
      }

      // POST /research-file/local-upload/:token — multipart upload (JWT + one-time token).
      if (method === 'POST' && seg[0] === 'local-upload' && seg[1]) {
        const userId = await currentUserId(pool, req)
        if (userId === null) return fail(res, 401, 'unauthorized')
        const token = seg[1]
        const expected = tokenToKey.get(token)
        if (!expected) return fail(res, 400, 'invalid upload token')
        let parsed
        try {
          parsed = await parseUpload(req)
        } catch {
          return fail(res, 400, 'multipart parse failed')
        }
        if (!parsed.fileBuf || parsed.fileBuf.length === 0) return fail(res, 400, 'file cannot be empty')
        if (parsed.keyField !== expected) return fail(res, 400, 'key mismatch')
        tokenToKey.delete(token) // one-time use
        const p = resolveKey(expected)
        if (!p) return fail(res, 400, 'invalid key')
        try {
          await fsp.mkdir(path.dirname(p), { recursive: true })
          await fsp.writeFile(p, parsed.fileBuf)
          return ok(res, { key: expected })
        } catch (e) {
          ctx.logger.warn(`[research-file] store error: ${e.message}`)
          return fail(res, 500, `store failed: ${e.message}`)
        }
      }

      // GET/DELETE /research-file/files/{key...}
      if (seg[0] === 'files' && seg[1]) {
        const key = seg.slice(1).join('/')
        if (method === 'GET') {
          const userId = await currentUserId(pool, req)
          const internal = isInternal(req)
          if (userId === null && !internal) return fail(res, 401, 'unauthorized')
          const p = resolveKey(key)
          if (p && fs.existsSync(p)) {
            try {
              return serveLocal(res, p, key, req.headers.range)
            } catch (e) {
              ctx.logger.warn(`[research-file] read error: ${e.message}`)
              return fail(res, 500, `read failed: ${e.message}`)
            }
          }
          return fail(res, 404, 'file not found')
        }
        if (method === 'DELETE') {
          const userId = await currentUserId(pool, req)
          if (userId === null) return fail(res, 401, 'unauthorized')
          const p = resolveKey(key)
          if (!p || !fs.existsSync(p)) return fail(res, 404, 'file not found')
          try {
            await fsp.unlink(p)
            // Best-effort: clean the now-empty papers/{uuid}/ parent (mirror backend deleteFile).
            const parent = path.dirname(p)
            if (parent.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
              try {
                await fsp.rmdir(parent)
              } catch {
                /* non-empty or missing — ignore */
              }
            }
            return ok(res, null)
          } catch (e) {
            ctx.logger.warn(`[research-file] delete error: ${e.message}`)
            return fail(res, 500, `delete failed: ${e.message}`)
          }
        }
        return fail(res, 405, 'method not allowed')
      }

      return fail(res, 404, 'not found')
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
  })
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export default { name, inject, apply }
