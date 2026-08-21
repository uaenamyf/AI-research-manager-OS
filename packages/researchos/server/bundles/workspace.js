// research-workspace: ResearchOS 工作区浏览 bundle（运行于 dsh 内）。
//
// Purpose: 右侧 rail「工作区」栏目的后端 —— 列出工作区文件树、git 分支 /
// 变更状态 / diff、读取文件内容供预览。工作区根目录默认 = 父仓库根
// （DSH cwd 上一级，即 AI-research-manager-OS），可用环境变量
// RESEARCH_WORKSPACE_DIR 覆盖。
//
// Routes (mounted on the dsh webserver, prefix /research-workspace):
//   GET  /research-workspace/roots              -> { roots[], default }  (合法根列表)
//   GET  /research-workspace/overview?path=...  -> { root, branch, files[], changes[] } (path 必须命中 roots)
//   GET  /research-workspace/content?path=...&root=... -> { path, size, kind, mime, text?|base64? } (path 为相对根，root 必填命中 roots)
//   GET  /research-workspace/raw?path=...&root=...    -> 文件字节流
//   GET  /research-workspace/diff?path=...&root=...   -> { path, oldText, newText, isBinary } (old=HEAD，new=工作区)
//   GET  /research-workspace/events                   -> SSE 实时变更推送（文件保存 / git 操作触发）
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_WORKSPACE_ROOTS  逗号分隔多根（缺省 = 单根 [RESEARCH_WORKSPACE_DIR]）
//   RESEARCH_WORKSPACE_DIR    单根回退（保留旧名兼容）
//   RESEARCH_INTERNAL_TOKEN   (shared X-Internal-Token)
//   JWT_SECRET                (shared with backend)
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE (for the user-existence auth check)
// @module @researchos/dsh-research-workspace

import { execFile } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import fs from 'node:fs'
import jwt from 'jsonwebtoken'
import { createPool } from '../../lib/db.js'

export const name = 'research-workspace'

export const inject = ['webServer']

// 工作区根列表：显式 env > DSH checkout 的父目录（父仓库根）。
// 支持多根 —— 左侧 DSH 切换 workspace 时，UI 端把目标 path 作为
// `?path=<absolute>` 透传给 overview/content/diff/raw，bundle 校验
// 该 path 命中此列表才放行（防任意路径 LFI）。
// 2026-08-20 myf: 自动发现每个根下的 git submodule 目录并入白名单 ——
// 变更树里 submodule 是单行 gitlink（如 deepseek-harness-master），用户
// 期望点进去看 submodule 内部的变更文件，submodule 目录必须能被
// ?root= 命中（否则 400 workspace root not in allowlist）。
function resolveWorkspaceRoots() {
  const raw = process.env.RESEARCH_WORKSPACE_ROOTS
  let candidates
  if (raw && raw.trim()) {
    candidates = raw.split(',').map(function (s) { return s.trim() }).filter(Boolean)
  } else {
    const cwd = process.cwd()
    const fallback = process.env.RESEARCH_WORKSPACE_DIR || (
      fs.existsSync(path.join(cwd, '.git')) || fs.existsSync(path.join(cwd, 'packages'))
        ? cwd
        : path.resolve(cwd, '..')
    )
    candidates = [fallback]
  }
  // 2026-08-20 myf: 启动时解析 + 校验每个根（绝对路径 + 存在 + 是目录），
  // 校验失败的根在日志里 warn 但保留（让 UI 端能看到「该根不可用」
  // 状态而非静默缺失）。去重保持顺序。
  const seen = new Set()
  const out = []
  // 收集每个根的 submodule 子目录（.gitmodules 或子目录含 .git 文件）
  function findSubmodules(rootDir) {
    const subs = []
    let modules
    try {
      // 同步读取：无 .gitmodules 的文件不存在会抛错，直接返回空
      modules = fs.readFileSync(path.join(rootDir, '.gitmodules'), 'utf8')
    } catch {
      return subs
    }
    // .gitmodules: [submodule "name"]\n  path = xxx
    const re = /^\s*path\s*=\s*(.+)$/gm
    let m
    while ((m = re.exec(modules))) {
      const rel = m[1].trim()
      if (!rel || rel.includes('..')) continue
      const abs = path.resolve(rootDir, rel)
      // 必须是目录且含 .git（gitlink 落地目录）
      try {
        if (fs.statSync(abs).isDirectory() && fs.existsSync(path.join(abs, '.git'))) {
          subs.push(abs)
        }
      } catch {
        /* 跳过不可达 submodule */
      }
    }
    return subs
  }
  for (const c of candidates) {
    const abs = path.resolve(c)
    if (seen.has(abs)) continue
    seen.add(abs)
    out.push(abs)
    // 该根下的 submodule 也加入白名单（让 ?root=<submodule 路径> 可命中）
    for (const sub of findSubmodules(abs)) {
      if (seen.has(sub)) continue
      seen.add(sub)
      out.push(sub)
    }
  }
  return out
}
const WORKSPACE_ROOTS = resolveWorkspaceRoots()
const DEFAULT_ROOT = WORKSPACE_ROOTS[0]
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

// 递归扫描时跳过的目录（噪音 / 产物 / 依赖 / VCS）。
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'lib', 'coverage', '.next', '.nuxt',
  '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache',
  '.DS_Store', 'target', 'build', 'vendor', '.dsh', '.dsh-gateway.log',
])

const MAX_SCAN_FILES = 4000 // 防止超大仓库扫爆

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

/** JWT user id with app_user existence check; null when not authenticated. */
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

/** 解析查询参数（dsh webServer 未内置 url 解析，自行从 req.url 取）。 */
function parseQuery(req) {
  const url = new URL(req.url, 'http://localhost')
  return url.searchParams
}

// 2026-08-20 myf: 解析请求里的 `?root=<absolute>` —— UI 切换 workspace
// 时透传目标根。命中 WORKSPACE_ROOTS 之一（恒等）才放行 —— 不接受任
// 意父级逃逸（避免 `?root=/etc` 或 `?root=/Users` 之类）。缺省时回退
// DEFAULT_ROOT。返回 null 表示「非允许根」（handler 转 400）。
function parseRootParam(req) {
  const q = parseQuery(req).get('root') || ''
  if (!q) return DEFAULT_ROOT
  const abs = path.resolve(q)
  const hit = WORKSPACE_ROOTS.find(function (r) { return r === abs })
  if (!hit) return null
  return hit
}

/** 运行 git 命令，返回 stdout；失败抛错。cwd = 调用方传入的根。 */
function git(args, rootDir, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: rootDir, maxBuffer: 64 * 1024 * 1024, timeout: 15000, ...opts },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || err.message || '').toString().trim()
          reject(new Error(msg || 'git failed'))
          return
        }
        resolve(stdout.toString())
      },
    )
  })
}

/** 路径安全：仅允许根内相对路径（防目录穿越）。返回绝对路径或 null。 */
function resolveSafe(rootDir, relPath) {
  if (!relPath || typeof relPath !== 'string') return null
  if (relPath.includes('\0')) return null
  const abs = path.resolve(rootDir, relPath)
  if (abs !== rootDir && !abs.startsWith(rootDir + path.sep)) return null
  return abs
}

/** 递归扫描根目录文件（跳过噪音目录），返回相对路径数组（目录优先排序）。 */
async function scanFiles(rootDir) {
  const out = []
  let counter = 0
  // 2026-08-20 myf: 修复「大目录吞掉全部配额」——deepseek-harness-master 这类
  // submodule 有近 4000 个文件，旧实现深度优先从 .github/deepseek-harness-master
  // 开始扫，其他顶层目录（Implementation/scripts 等）根本轮不到就被
  // MAX_SCAN_FILES 截断，文件树看起来「只显示了 .github 和 dsh」。
  // 改为顶层目录配额均分：每个顶层条目最多拿 budget = max(64, MAX/F) 的
  // 配额，避免单个目录饿死其余目录；单层文件不占顶层配额。
  async function walk(dir, budgetRef) {
    if (counter >= MAX_SCAN_FILES) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
    for (const ent of entries) {
      if (counter >= MAX_SCAN_FILES) return
      if (budgetRef.used >= budgetRef.limit && dir !== rootDir) return
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue
        const subBudget = dir === rootDir
          ? { limit: Math.max(64, Math.floor(MAX_SCAN_FILES / Math.max(entries.filter((e) => e.isDirectory()).length, 1))), used: 0 }
          : budgetRef
        await walk(path.join(dir, ent.name), subBudget)
      } else {
        const rel = path.relative(rootDir, path.join(dir, ent.name))
        if (!rel || rel.startsWith('..')) continue
        out.push(rel)
        counter++
        budgetRef.used++
      }
    }
  }
  await walk(rootDir, { limit: MAX_SCAN_FILES, used: 0 })
  return out
}

/** 解析 git status --porcelain=v1 输出 -> [{ path, status, staged }]（status 单字母缩写）。 */
function parseStatus(raw) {
  const changes = []
  for (const line of raw.split('\n')) {
    if (!line || line.length < 3) continue
    const xy = line.slice(0, 2)
    const file = line.slice(3)
    if (!file) continue
    // 重命名/复制：`R  old -> new` 取 new
    let p = file
    const arrow = file.indexOf(' -> ')
    if (arrow !== -1) p = file.slice(arrow + 4)
    const x = xy[0] // 暂存区状态
    const y = xy[1] // 工作区状态
    let status
    if (x === '?' && y === '?') status = 'U' // untracked
    else if (x === 'M') status = y === 'M' ? 'M' : 'A'
    else if (x === 'A') status = 'A'
    else if (x === 'D') status = 'D'
    else if (x === 'R') status = 'R'
    else if (x === 'C') status = 'C'
    else if (y === 'M') status = 'M'
    else if (y === 'D') status = 'D'
    else status = 'M'
    changes.push({ path: p, status, staged: x !== ' ' && x !== '?' })
  }
  return changes
}

/** 文件类型：binary / image / pdf / text 及 mime。 */
function classifyFile(absPath) {
  const ext = path.extname(absPath).toLowerCase()
  const img = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'])
  if (img.has(ext)) return { kind: 'image', mime: ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1)}` }
  if (ext === '.pdf') return { kind: 'pdf', mime: 'application/pdf' }
  return { kind: 'text', mime: 'text/plain' }
}

// ── 实时变更推送（主流方案：文件系统监听 + SSE）──────────────────────────────
// 2026-08-21 myf: 参考 VS Code FileSystemWatcher + GitHub EventSource ——
// 后端 fs.watch 递归监听工作区根（等价 watcher），文件变化经 SSE 推送
// 给前端（/research-workspace/events），前端收到后防抖重拉 overview +
// 当前打开文件的 diff。git 操作（commit/add/checkout）不产生工作区文件
// 事件，但对 .git 控制文件（HEAD/index/refs/*）单独监听 —— git 写库即
// 触发推送，覆盖「改文件保存」与「git 操作」两类变化源，无需轮询。
const SSE_CLIENTS = new Set() // 活跃 SSE 响应
const FILE_WATCHERS = [] // 全部 watcher（dispose 时统一关闭）
const WATCH_DEBOUNCE_MS = 400 // 合并短时间多次文件事件（保存=rename+change）

/** 向所有 SSE 客户端广播一条事件（命名事件 change，前端 addEventListener）。 */
function sseBroadcast(payload) {
  const data = `event: change\ndata: ${JSON.stringify(payload)}\n\n`
  for (const res of SSE_CLIENTS) {
    try {
      res.write(data)
    } catch {
      /* 连接已断，等 close 事件清理 */
    }
  }
}

/** 事件去抖：ms 内多次调用合并为一次。 */
function debounce(fn, ms) {
  let t = null
  return function (...args) {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      fn(...args)
    }, ms)
  }
}

/** filename（相对根）是否落在 SKIP_DIRS 顶层目录里（node_modules 等噪音）。 */
function isSkippedTopDir(filename) {
  if (!filename) return false
  const top = String(filename).split(/[\\/]/)[0]
  return SKIP_DIRS.has(top)
}

/**
 * 对单个根建立监听：
 *  1) 递归监听整个根（过滤 SKIP_DIRS 顶层），覆盖「文件保存/增删改」；
 *  2) 对 <root>/.git 递归监听但只认控制文件（HEAD/index/refs/*…），
 *     覆盖 git add/commit/checkout —— 写库即触发。
 * 任一事件 → 400ms 去抖 → emit(root)。
 */
function watchRoot(root, emit) {
  let t = null
  const fire = () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      emit(root)
    }, WATCH_DEBOUNCE_MS)
  }
  // 工作区文件（递归）
  try {
    const w = fs.watch(root, { recursive: true }, (evt, filename) => {
      if (isSkippedTopDir(filename)) return // 跳过 .git 内部 / node_modules 等
      fire()
    })
    w.on('error', () => {})
    FILE_WATCHERS.push(w)
  } catch {
    // 平台不支持 recursive 时降级非递归（仅顶层，保底）
    try {
      const w2 = fs.watch(root, (evt, filename) => {
        if (!isSkippedTopDir(filename)) fire()
      })
      w2.on('error', () => {})
      FILE_WATCHERS.push(w2)
    } catch {
      /* 忽略 */
    }
  }
  // .git 控制文件（git add/commit/checkout 写库信号）
  const gitDir = path.join(root, '.git')
  try {
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      const wg = fs.watch(gitDir, { recursive: true }, (evt, filename) => {
        if (!filename) return
        const rel = String(filename)
        // 只认 git 状态相关控制文件，忽略 objects/（对象写入洪流）与 logs/
        if (
          rel === 'HEAD' || rel === 'index' || rel === 'COMMIT_EDITMSG' ||
          rel === 'MERGE_HEAD' || rel === 'ORIG_HEAD' || rel === 'FETCH_HEAD' ||
          rel.startsWith('refs/')
        ) fire()
      })
      wg.on('error', () => {})
      FILE_WATCHERS.push(wg)
    }
  } catch {
    /* 忽略 */
  }
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = createPool()
  ctx.logger.info(`[research-workspace] loaded — workspace roots: ${WORKSPACE_ROOTS.join(', ')}`)
  // 2026-08-21 myf: 启动对所有根的实时文件监听（主流方案：fs.watch +
  // SSE 推送）。广播对象带 root，前端按 activeRoot 过滤只刷当前根。
  const emitChange = debounce((root) => {
    ctx.logger.debug?.(`[research-workspace] change in ${root}`)
    sseBroadcast({ type: 'change', root })
  }, 50)
  for (const r of WORKSPACE_ROOTS) watchRoot(r, (root) => emitChange(root))
  // 2026-08-20 myf: 暴露根列表给前端（GET /research-workspace/roots），
  // UI 端用此列表 = 切换 workspace 时的合法 path 候选。无 token 泄露：
  // 该接口只返回绝对路径数组 + 默认根，不返回文件系统其它信息。
  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-workspace',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const pathname = url.pathname.replace(/\/+$/, '')
      const method = req.method
      if (method !== 'GET') return fail(res, 405, 'method not allowed')

      // 鉴权：登录用户或内部 token（研究区无登录 UI 时亦可访问）。
      const userId = await currentUserId(pool, req)
      if (userId === null && !isInternal(req)) return fail(res, 401, 'unauthorized')

      // GET /research-workspace/roots — 合法根列表（UI 端用于切换候选）。
      if (pathname === '/research-workspace/roots') {
        return ok(res, { roots: WORKSPACE_ROOTS, default: DEFAULT_ROOT })
      }

      // GET /research-workspace/overview — 工作区总览（分支 + 文件树 + 变更）。
      if (pathname === '/research-workspace/overview') {
        const root = parseRootParam(req)
        if (!root) return fail(res, 400, 'workspace root not in allowlist')
        try {
          let branch = ''
          try { branch = (await git(['branch', '--show-current'], root)).trim() } catch { /* 非 git 目录 */ }
          const [files, statusRaw] = await Promise.all([
            scanFiles(root),
            git(['status', '--porcelain=v1'], root).catch(() => ''),
          ])
          const changes = parseStatus(statusRaw)
          return ok(res, { root, branch, files, changes })
        } catch (e) {
          ctx.logger.warn(`[research-workspace] overview error: ${e.message}`)
          return fail(res, 500, `overview failed: ${e.message}`)
        }
      }

      // GET /research-workspace/content?path=... — 文件内容预览。
      if (pathname === '/research-workspace/content') {
        const root = parseRootParam(req)
        if (!root) return fail(res, 400, 'workspace root not in allowlist')
        const rel = parseQuery(req).get('path') || ''
        const abs = resolveSafe(root, rel)
        if (!abs) return fail(res, 400, 'invalid path')
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return fail(res, 404, 'file not found')
        try {
          const stat = await fsp.stat(abs)
          if (stat.size > 5 * 1024 * 1024) {
            return ok(res, { path: rel, size: stat.size, kind: 'text', mime: 'text/plain', truncated: true, text: '' })
          }
          const buf = await fsp.readFile(abs)
          const info = classifyFile(abs)
          const looksBinary = buf.includes(0)
          if (info.kind === 'text' && looksBinary) info.kind = 'binary'
          if (info.kind === 'text') {
            return ok(res, {
              path: rel, size: stat.size, kind: 'text', mime: info.mime, truncated: false,
              text: buf.toString('utf8'),
            })
          }
          // image / pdf / binary：返回 base64 供前端直显。
          return ok(res, {
            path: rel, size: stat.size, kind: info.kind, mime: info.mime, truncated: false,
            base64: buf.toString('base64'),
          })
        } catch (e) {
          ctx.logger.warn(`[research-workspace] content error: ${e.message}`)
          return fail(res, 500, `read failed: ${e.message}`)
        }
      }

      // GET /research-workspace/raw?path=... — 文件字节流（图片 / PDF 预览直显）。
      if (pathname === '/research-workspace/raw') {
        const root = parseRootParam(req)
        if (!root) return fail(res, 400, 'workspace root not in allowlist')
        const rel = parseQuery(req).get('path') || ''
        const abs = resolveSafe(root, rel)
        if (!abs) return fail(res, 400, 'invalid path')
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return fail(res, 404, 'file not found')
        try {
          const buf = await fsp.readFile(abs)
          const info = classifyFile(abs)
          res.writeHead(200, {
            'content-type': info.mime,
            'content-length': buf.length,
            'cache-control': 'no-store',
          })
          res.end(buf)
          return
        } catch (e) {
          ctx.logger.warn(`[research-workspace] raw error: ${e.message}`)
          return fail(res, 500, `read failed: ${e.message}`)
        }
      }

      // GET /research-workspace/diff?path=... — 单文件 diff（old/new 文本对）。
      // 2026-08-21 myf: 返回 { path, oldText, newText, isBinary } 而非 unified
      // text —— 前端 react-diff-viewer 并排渲染需要两侧纯文本。old = HEAD
      // 版本（新文件/untracked 时为 ""），new = 工作区当前内容（已删除时
      // 为 ""）。二进制文件 newText 留空，由前端显示 binary 占位。
      if (pathname === '/research-workspace/diff') {
        const root = parseRootParam(req)
        if (!root) return fail(res, 400, 'workspace root not in allowlist')
        const rel = parseQuery(req).get('path') || ''
        const abs = resolveSafe(root, rel)
        if (!abs) return fail(res, 400, 'invalid path')
        try {
          const staged = parseQuery(req).get('staged')
          const ref = staged === '1' || staged === 'true' ? ':0' : 'HEAD'
          // 旧版本：git show <ref>:<rel>（git 原生输出 blob 原文，LF/CRLF 不转换）；
          // 新文件 / untracked 时 git 报错（exit != 0）→ 空串，前端视为全新增。
          const oldText = await git(['show', `${ref}:${rel}`], root).catch(() => '')
          // 新版本：工作区当前内容；已删除文件不存在 → ""，前端视为全删除。
          let newText = ''
          let isBinary = false
          if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            const buf = await fsp.readFile(abs)
            isBinary = buf.includes(0)
            newText = isBinary ? '' : buf.toString('utf8')
          }
          return ok(res, { path: rel, oldText, newText, isBinary })
        } catch (e) {
          ctx.logger.warn(`[research-workspace] diff error: ${e.message}`)
          return fail(res, 500, `diff failed: ${e.message}`)
        }
      }

      // GET /research-workspace/events — SSE 实时变更推送（主流方案）。
      // 前端 EventSource 订阅；文件保存 / git 操作后收到 {type:'change',
      // root} 事件，防抖重拉 overview + 当前打开的 diff。心跳 25s 一条
      // 注释行保持连接活跃（过代理防断）。
      if (pathname === '/research-workspace/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        res.write(': connected\n\n')
        SSE_CLIENTS.add(res)
        const heartbeat = setInterval(() => {
          try {
            res.write(': ping\n\n')
          } catch {
            clearInterval(heartbeat)
          }
        }, 25000)
        req.on('close', () => {
          clearInterval(heartbeat)
          SSE_CLIENTS.delete(res)
        })
        return
      }

      return fail(res, 404, 'not found')
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
    for (const w of FILE_WATCHERS) {
      try { w.close() } catch { /* 已关闭 */ }
    }
    FILE_WATCHERS.length = 0
    for (const res of SSE_CLIENTS) {
      try { res.end() } catch { /* 已断开 */ }
    }
    SSE_CLIENTS.clear()
  })
}

export default { name, inject, apply }
