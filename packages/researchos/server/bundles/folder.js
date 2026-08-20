// Phase 3 research-folder: ResearchOS folder tree CRUD bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy Spring Boot FolderController
// exposes, as a dsh bundle talking directly to the MySQL folder table. Every
// query is filtered by user_id (ownership rule) and project_id; auth reuses the
// shared JWT (same JWT_SECRET as research-auth / backend).
//
// Routes (mounted on the dsh webserver, prefix /research-folder):
//   POST   /research-folder/folders                        { projectId, parentId?, name } -> create
//   GET    /research-folder/projects/:projectId/folders/tree                               -> nested tree (children)
//   GET    /research-folder/projects/:projectId/folders?parentId=                          -> root / child folders
//   PUT    /research-folder/folders/:folderId/rename       { name }
//   PUT    /research-folder/folders/:folderId/move         { parentId }
//   PUT    /research-folder/folders/:folderId/sort         { sortOrder }
//   DELETE /research-folder/folders/:folderId                                             -> recursive delete
//
// Ownership semantics (mirror FolderServiceImpl.checkOwnership): folder missing -> 404,
// folder owned by another user -> 403. Move guards: same-project only, no self-move, no
// circular reference. Delete removes the folder and all descendants (children of removed
// folders are NOT re-parented; papers in them are set NULL by the DB FK and return to root).
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos@127.0.0.1:3306/researchos)
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
// @module @researchos/dsh-research-folder

import { createPool } from '../../lib/db.js'
import jwt from 'jsonwebtoken'

export const name = 'research-folder'

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

function normTime(v) {
  if (v instanceof Date) return v.toISOString()
  return v ? String(v).replace(' ', 'T') : null
}

function toFolderDto(row, withChildren = false) {
  const dto = {
    id: Number(row.id),
    userId: Number(row.user_id),
    projectId: Number(row.project_id),
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    name: row.name,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: normTime(row.created_at),
    updatedAt: normTime(row.updated_at),
  }
  if (withChildren) dto.children = []
  else dto.children = null
  return dto
}

/** Build nested tree from flat rows: sort_order DESC then name ASC, recursively. */
function buildTree(rows) {
  const byId = new Map(rows.map((r) => [Number(r.id), toFolderDto(r, true)]))
  const roots = []
  for (const r of rows) {
    const node = byId.get(Number(r.id))
    const pid = r.parent_id == null ? null : Number(r.parent_id)
    if (pid === null) roots.push(node)
    else {
      const parent = byId.get(pid)
      if (parent) parent.children.push(node)
      else roots.push(node) // dangling parent (shouldn't happen) — keep as root
    }
  }
  const cmp = (a, b) => b.sortOrder - a.sortOrder || a.name.localeCompare(b.name)
  const sortRec = (nodes) => {
    nodes.sort(cmp)
    for (const n of nodes) if (n.children.length) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

/** Check a folder belongs to the user: returns row or null. */
async function findOwnedFolder(pool, userId, folderId) {
  const [rows] = await pool.query(
    'SELECT id, user_id, project_id, parent_id, name, sort_order, created_at, updated_at FROM folder WHERE id = ? AND user_id = ?',
    [folderId, userId],
  )
  return rows[0] ?? null
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = createPool()
  ctx.logger.info(
    `[research-folder] loaded — folder tree CRUD over MySQL folder (${DB.user}@${DB.host}:${DB.port}/${DB.database})`,
  )

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-folder',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const pathname = url.pathname.replace(/\/+$/, '')
      const userId = await currentUserId(pool, req)
      if (userId === null) return fail(res, 401, 'unauthorized')

      const seg = (() => {
        const s = pathname.replace(/^\/research-folder\/?/, '')
        return s ? s.split('/') : []
      })()
      const method = req.method

      // POST /research-folder/folders
      if (method === 'POST' && seg.length === 1 && seg[0] === 'folders') {
        let body
        try {
          body = await readJson(req)
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const projectId = Number(body.projectId)
        const parentId = body.parentId == null ? null : Number(body.parentId)
        const name = String(body.name || '').trim()
        if (!Number.isInteger(projectId) || projectId <= 0) return fail(res, 400, 'projectId is required')
        if (!name) return fail(res, 400, 'name is required')
        try {
          // Project must exist and belong to the user (ownership rule).
          const [proj] = await pool.query(
            'SELECT id FROM research_project WHERE id = ? AND user_id = ?',
            [projectId, userId],
          )
          if (!proj.length) return fail(res, 404, 'project not found')
          if (parentId != null) {
            const parent = await findOwnedFolder(pool, userId, parentId)
            if (!parent) return fail(res, 404, 'parent folder not found')
            if (Number(parent.project_id) !== projectId) return fail(res, 400, 'parent folder is not in this project')
          }
          const [result] = await pool.query(
            'INSERT INTO folder (user_id, project_id, parent_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NOW(6), NOW(6))',
            [userId, projectId, parentId, name],
          )
          const [rows] = await pool.query(
            'SELECT id, user_id, project_id, parent_id, name, sort_order, created_at, updated_at FROM folder WHERE id = ?',
            [result.insertId],
          )
          return ok(res, toFolderDto(rows[0]))
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Folder name already exists in the same directory')
          ctx.logger.warn(`[research-folder] create error: ${e.message}`)
          return fail(res, 500, `create failed: ${e.message}`)
        }
      }

      // GET /research-folder/projects/:projectId/folders/tree
      // GET /research-folder/projects/:projectId/folders
      if (method === 'GET' && seg[0] === 'projects' && seg[2] === 'folders') {
        const projectId = Number(seg[1])
        if (!Number.isInteger(projectId) || projectId <= 0) return fail(res, 400, 'invalid project id')
        try {
          const [rows] = await pool.query(
            'SELECT id, user_id, project_id, parent_id, name, sort_order, created_at, updated_at FROM folder WHERE user_id = ? AND project_id = ?',
            [userId, projectId],
          )
          if (seg[3] === 'tree') {
            return ok(res, buildTree(rows))
          }
          const parentIdParam = url.searchParams.get('parentId')
          if (parentIdParam == null || parentIdParam === '') {
            const roots = rows.filter((r) => r.parent_id == null)
            roots.sort((a, b) => Number(b.sort_order ?? 0) - Number(a.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)))
            return ok(res, roots.map((r) => toFolderDto(r)))
          }
          const parentId = Number(parentIdParam)
          const children = rows.filter((r) => r.parent_id != null && Number(r.parent_id) === parentId)
          children.sort((a, b) => Number(b.sort_order ?? 0) - Number(a.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)))
          return ok(res, children.map((r) => toFolderDto(r)))
        } catch (e) {
          ctx.logger.warn(`[research-folder] list/tree error: ${e.message}`)
          return fail(res, 500, `load folders failed: ${e.message}`)
        }
      }

      // folder item routes: /research-folder/folders/:folderId[/rename|move|sort]
      if (seg[0] === 'folders' && seg[1]) {
        const folderId = Number(seg[1])
        if (!Number.isInteger(folderId) || folderId <= 0) return fail(res, 404, 'folder not found')
        const action = seg[2]
        try {
          const folder = await findOwnedFolder(pool, userId, folderId)
          if (!folder) return fail(res, 404, 'folder not found')
          const owned = (id) => findOwnedFolder(pool, userId, id)

          // DELETE /research-folder/folders/:folderId
          if (method === 'DELETE' && action === undefined) {
            // Recursively collect descendants, then delete all (mirror deleteFolder).
            const ids = [folderId]
            const all = (await pool.query(
              'SELECT id, parent_id FROM folder WHERE user_id = ? AND project_id = ?',
              [userId, folder.project_id],
            ))[0]
            const childMap = new Map()
            for (const r of all) {
              if (r.parent_id != null) {
                const p = Number(r.parent_id)
                if (!childMap.has(p)) childMap.set(p, [])
                childMap.get(p).push(Number(r.id))
              }
            }
            const stack = [...(childMap.get(folderId) ?? [])]
            while (stack.length) {
              const id = stack.pop()
              ids.push(id)
              for (const c of childMap.get(id) ?? []) stack.push(c)
            }
            // 2026-08-21 myf: SQLite 不支持 `IN (?)` 传数组，展开为等量占位符（ids 恒含 folderId 自身，不会为空）
            const placeholders = ids.map(() => '?').join(',')
            await pool.query(`DELETE FROM folder WHERE id IN (${placeholders})`, ids)
            return ok(res, null)
          }

          // PUT /research-folder/folders/:folderId/rename
          if (method === 'PUT' && action === 'rename') {
            const body = await readJson(req)
            const name = String(body.name || '').trim()
            if (!name) return fail(res, 400, 'name is required')
            await pool.query('UPDATE folder SET name = ?, updated_at = NOW(6) WHERE id = ? AND user_id = ?', [name, folderId, userId])
            const fresh = await owned(folderId)
            return ok(res, toFolderDto(fresh))
          }

          // PUT /research-folder/folders/:folderId/sort
          if (method === 'PUT' && action === 'sort') {
            const body = await readJson(req)
            const sortOrder = Number(body.sortOrder ?? 0)
            if (!Number.isInteger(sortOrder)) return fail(res, 400, 'sortOrder must be an integer')
            await pool.query('UPDATE folder SET sort_order = ?, updated_at = NOW(6) WHERE id = ? AND user_id = ?', [sortOrder, folderId, userId])
            return ok(res, null)
          }

          // PUT /research-folder/folders/:folderId/move
          if (method === 'PUT' && action === 'move') {
            const body = await readJson(req)
            const newParentId = body.parentId == null ? null : Number(body.parentId)
            if (newParentId != null) {
              const newParent = await owned(newParentId)
              if (!newParent) return fail(res, 404, 'parent folder not found')
              if (Number(newParent.project_id) !== Number(folder.project_id)) {
                return fail(res, 400, 'Cannot move folder across projects')
              }
              if (newParentId === folderId) return fail(res, 400, 'Cannot move a folder into itself')
              // Circular reference: walk up from newParent; if we reach folderId, reject.
              const all = (await pool.query(
                'SELECT id, parent_id FROM folder WHERE user_id = ? AND project_id = ?',
                [userId, folder.project_id],
              ))[0]
              const parentOf = new Map(all.filter((r) => r.parent_id != null).map((r) => [Number(r.id), Number(r.parent_id)]))
              let cur = newParentId
              while (parentOf.has(cur)) {
                if (parentOf.get(cur) === folderId) return fail(res, 400, 'Circular reference')
                cur = parentOf.get(cur)
              }
              await pool.query('UPDATE folder SET parent_id = ?, updated_at = NOW(6) WHERE id = ? AND user_id = ?', [newParentId, folderId, userId])
            } else {
              await pool.query('UPDATE folder SET parent_id = NULL, updated_at = NOW(6) WHERE id = ? AND user_id = ?', [folderId, userId])
            }
            const fresh = await owned(folderId)
            return ok(res, toFolderDto(fresh))
          }

          return fail(res, 405, 'method not allowed')
        } catch (e) {
          ctx.logger.warn(`[research-folder] item error: ${e.message}`)
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
