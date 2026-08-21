// ResearchOS paper store: filesystem-based metadata index (replaces the
// SQLite paper table; paper_chunk vectors stay in SQLite for similarity search).
//
// Layout under $RESEARCH_STORAGE_LOCAL_DIR (default ~/.researchos):
//   papers/
//     <projectId>/
//       <paperId>.pdf           # PDF content (always present locally; user
//                                either uploaded a local file or we downloaded
//                                the source url)
//     index.json                # single-file metadata index, atomic-replace writes
//
// index.json shape:
//   {
//     "version": 1,
//     "updatedAt": "2026-08-21T...",
//     "papers": {
//        "<paperId>": {
//          "id": "<paperId>",
//          "projectId": <int>,
//          "userId": <int>,
//          "folderId": <int|null>,
//          "title": "...",
//          "authors": "..." | null,
//          "year": <int|null>,
//          "doi": "..." | null,
//          "sourceUrl": "..." | null,   // original PDF URL if downloaded from web
//          "fileName": "..." | null,    // original file name if uploaded
//          "localPdf": "<projectId>/<paperId>.pdf",   // path relative to papers/
//          "status": "UPLOADED" | "PROCESSING" | "READY" | "FAILED",
//          "error": "..." | null,
//          "paperCard": { ... } | null, // LLM-generated summary
//          "readingStatus": "unread" | "reading" | "read",
//          "starRating": <int|null>,
//          "createdTime": "2026-08-21T...",
//          "updatedTime": "2026-08-21T..."
//        }
//     }
//   }
//
// Concurrency: a single in-process Mutex serializes index reads/writes within
// one server. DSH web profile runs one server process, so cross-process races
// don't occur; if multi-instance lands, the same atomic-rename + read-once
// pattern + Mutex-per-process still works for one writer at a time per file
// (operational TODO: real file lock if multi-instance is ever needed).
//
// @module @researchos/dsh-researchos/lib/papers-store

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomBytes } from 'node:crypto'

const PAPERS_DIR = path.resolve(
  process.env.RESEARCH_PAPERS_DIR || path.join(os.homedir(), '.researchos', 'papers'),
)
const INDEX_FILE = path.join(PAPERS_DIR, 'index.json')

const VERSION = 1
let _cache = null
let _writeChain = Promise.resolve()

/** Tiny in-process mutex: chain writes so concurrent PATCH/import don't clobber. */
function withLock(fn) {
  const next = _writeChain.then(fn, fn)
  _writeChain = next.catch(() => {})
  return next
}

async function readIndex() {
  if (_cache) return _cache
  try {
    const raw = await fsp.readFile(INDEX_FILE, 'utf8')
    const j = JSON.parse(raw)
    _cache = {
      version: j.version || VERSION,
      updatedAt: j.updatedAt || null,
      papers: j.papers && typeof j.papers === 'object' ? j.papers : {},
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    _cache = { version: VERSION, updatedAt: null, papers: {} }
  }
  return _cache
}

async function writeIndex(idx) {
  const next = { ...idx, version: VERSION, updatedAt: new Date().toISOString() }
  const tmp = `${INDEX_FILE}.${process.pid}.${Date.now()}.tmp`
  await fsp.mkdir(PAPERS_DIR, { recursive: true })
  await fsp.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
  await fsp.rename(tmp, INDEX_FILE)
  _cache = next
  return next
}

function invalidate() {
  _cache = null
}

/** Generate a stable, file-system-friendly paper id (24-char base32). */
export function newPaperId() {
  return 'pap_' + randomBytes(12).toString('hex')
}

/** Absolute path of the local PDF file for a paper id. */
export function localPdfPath(paperId, projectId) {
  return path.join(PAPERS_DIR, String(projectId), `${paperId}.pdf`)
}

/** Make sure <projectId>/ directory exists; return absolute path. */
export async function ensureProjectDir(projectId) {
  const dir = path.join(PAPERS_DIR, String(projectId))
  await fsp.mkdir(dir, { recursive: true })
  return dir
}

/** List all papers (full metadata). */
export async function listPapers() {
  const idx = await readIndex()
  return Object.values(idx.papers)
}

/** List papers for a single project. */
export async function listProjectPapers(projectId) {
  const pid = String(projectId)
  const idx = await readIndex()
  return Object.values(idx.papers).filter((p) => String(p.projectId) === pid)
}

/** Get one paper by id, or null. */
export async function getPaper(paperId) {
  const idx = await readIndex()
  return idx.papers[paperId] || null
}

/** Insert a new paper record. Returns the stored object. */
export async function insertPaper(record) {
  return withLock(async () => {
    const idx = await readIndex()
    if (idx.papers[record.id]) {
      throw new Error(`paper ${record.id} already exists`)
    }
    const now = new Date().toISOString()
    const stored = {
      folderId: null,
      authors: null,
      year: null,
      doi: null,
      sourceUrl: null,
      fileName: null,
      paperCard: null,
      readingStatus: 'unread',
      starRating: null,
      error: null,
      status: 'UPLOADED',
      createdTime: now,
      updatedTime: now,
      ...record,
    }
    idx.papers[stored.id] = stored
    await writeIndex(idx)
    return stored
  })
}

/** Patch an existing paper record. Returns the new stored object (or null if missing). */
export async function patchPaper(paperId, patch) {
  return withLock(async () => {
    const idx = await readIndex()
    const cur = idx.papers[paperId]
    if (!cur) return null
    const next = { ...cur, ...patch, id: paperId, updatedTime: new Date().toISOString() }
    idx.papers[paperId] = next
    await writeIndex(idx)
    return next
  })
}

/** Delete a paper record + its local PDF file. Returns true if removed. */
export async function deletePaper(paperId) {
  return withLock(async () => {
    const idx = await readIndex()
    const cur = idx.papers[paperId]
    if (!cur) return false
    const abs = localPdfPath(cur.id, cur.projectId)
    try { await fsp.unlink(abs) } catch { /* already gone */ }
    delete idx.papers[paperId]
    await writeIndex(idx)
    return true
  })
}

/** Resolve the absolute path of a paper's local PDF if the file exists. */
export async function resolveLocalPdf(paperId) {
  const p = await getPaper(paperId)
  if (!p) return null
  const abs = localPdfPath(p.id, p.projectId)
  try {
    await fsp.access(abs, fs.constants.R_OK)
    return abs
  } catch {
    return null
  }
}

/** Drop the in-memory cache (test/reload hook). */
export function _reset() { _cache = null; _writeChain = Promise.resolve() }

export const _internals = {
  PAPERS_DIR,
  INDEX_FILE,
  invalidate,
  readIndex,
}
