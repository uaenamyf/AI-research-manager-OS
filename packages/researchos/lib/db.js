// researchos embedded storage: single-file SQLite (node:sqlite, zero deps).
//
// Replaces the MySQL (business) + PostgreSQL (pgvector) pair so the whole app
// runs with NO external database — clone & run. The db file lives at
// $RESEARCH_DATA_DIR/researchos.db (default ~/.researchos/data/researchos.db),
// created + schema-initialized on first open.
//
// mysql2-compatible surface so bundle SQL stays untouched as much as possible:
//   query(sql, params) -> Promise<[rows]>                (SELECT)
//   query(sql, params) -> Promise<[{insertId, affectedRows, changes}>]  (writes)
//   createPool() -> { query, execute, end }              (drop-in for mysql.createPool)
//
// The only dialect rewrite applied centrally: NOW(6) -> localtime strftime
// (keeps Asia/Shanghai local-time semantics MySQL had). Per-call rewrites
// (FIELD(), IN (?)) are fixed at each call site.
//
// @module @researchos/dsh-researchos/lib/db

import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// ── data file location ─────────────────────────────────────────────────────
export const DATA_DIR = path.resolve(
  process.env.RESEARCH_DATA_DIR || path.join(os.homedir(), '.researchos', 'data'),
)
export const DB_PATH = path.join(DATA_DIR, 'researchos.db')

// ── schema（2026-08-22 起为 SQLite 唯一 schema；源自 legacy infra/mysql-init/V1__init.sql + 运行时新增列，git 历史可查）──
const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password      TEXT,
  oauth_provider TEXT,
  oauth_id      TEXT,
  plan          TEXT DEFAULT 'FREE',
  settings      TEXT NOT NULL DEFAULT '{}',
  created_time  TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime'))
);
CREATE TABLE IF NOT EXISTS research_project (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  domain       TEXT,
  created_time TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime')),
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_user ON research_project(user_id);
CREATE TABLE IF NOT EXISTS folder (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  project_id  INTEGER NOT NULL,
  parent_id   INTEGER,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime')),
  UNIQUE (project_id, parent_id, name),
  FOREIGN KEY (project_id) REFERENCES research_project(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES folder(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_folder_user ON folder(user_id);
CREATE INDEX IF NOT EXISTS idx_folder_project ON folder(project_id);
CREATE INDEX IF NOT EXISTS idx_folder_parent ON folder(parent_id);
CREATE TABLE IF NOT EXISTS paper (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  folder_id      INTEGER,
  title          TEXT,
  authors        TEXT,
  year           INTEGER,
  doi            TEXT,
  pdf_url        TEXT NOT NULL,
  summary        TEXT,
  status         TEXT DEFAULT 'UPLOADED',
  created_time   TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime')),
  reading_status TEXT DEFAULT 'unread',
  star_rating    INTEGER,
  FOREIGN KEY (project_id) REFERENCES research_project(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folder(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_project ON paper(project_id);
CREATE INDEX IF NOT EXISTS idx_paper_user ON paper(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_folder ON paper(folder_id);
CREATE TABLE IF NOT EXISTS ai_task (
  task_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  type         TEXT,
  status       TEXT DEFAULT 'PENDING',
  result       TEXT,
  error        TEXT,
  created_time TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime')),
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_user ON ai_task(user_id);
-- legacy tables kept for schema compatibility (no active CRUD in bundles):
CREATE TABLE IF NOT EXISTS annotation (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id     INTEGER NOT NULL,
  user_id      INTEGER NOT NULL,
  page_num     INTEGER NOT NULL,
  x REAL, y REAL, width REAL, height REAL,
  text TEXT, note TEXT,
  color        TEXT DEFAULT '#FFEB3B',
  created_time TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime')),
  updated_time TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_annotation_paper ON annotation(paper_id);
CREATE INDEX IF NOT EXISTS idx_annotation_user ON annotation(user_id);
CREATE TABLE IF NOT EXISTS conversation (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  paper_id     INTEGER,
  question     TEXT,
  answer       TEXT,
  created_time TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime')),
  FOREIGN KEY (paper_id) REFERENCES paper(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversation(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_paper ON conversation(paper_id);
CREATE TABLE IF NOT EXISTS manuscript (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  project_id   INTEGER,
  title        TEXT NOT NULL,
  format       TEXT DEFAULT 'latex',
  content      TEXT,
  created_time TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime')),
  updated_time TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_manuscript_user ON manuscript(user_id);
CREATE INDEX IF NOT EXISTS idx_manuscript_project ON manuscript(project_id);
-- AI vector store: embedding = Float32Array BLOB (2048 dims). Cosine search is
-- done in JS (row counts are small — thousands of chunks, ms-scale scans).
CREATE TABLE IF NOT EXISTS paper_chunk (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id  INTEGER NOT NULL,
  section   TEXT,
  content   TEXT,
  embedding BLOB
);
CREATE INDEX IF NOT EXISTS idx_chunk_paper ON paper_chunk(paper_id);
`

// NOW(6) -> localtime string so bundle SQL (written for MySQL) needs no change.
const NOW_SQL = `strftime('%Y-%m-%d %H:%M:%f','now','localtime')`
const REWRITE_NOW = (sql) => sql.replace(/NOW\(\s*6\s*\)/g, NOW_SQL).replace(/\bNOW\(\)/g, NOW_SQL)

let _db = null
let _initError = null

/** Get the singleton DatabaseSync (lazy init: mkdir + schema + pragmas). */
export function getDb() {
  if (_db) return _db
  if (_initError) throw _initError
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const db = new DatabaseSync(DB_PATH)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec(SCHEMA)
    _db = db
    return db
  } catch (e) {
    _initError = e
    throw e
  }
}

function isWriteSql(sql) {
  const s = sql.trimStart().toUpperCase()
  return s.startsWith('INSERT') || s.startsWith('UPDATE') || s.startsWith('DELETE') || s.startsWith('REPLACE')
}

function execSql(sql, params = []) {
  const db = getDb()
  const stmt = db.prepare(REWRITE_NOW(sql))
  if (isWriteSql(sql)) {
    const r = stmt.run(...params)
    return [{ insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes), changedRows: Number(r.changes) }]
  }
  const rows = stmt.all(...params)
  return [rows]
}

/** mysql2-compatible async query. SELECT -> [rows]; writes -> [{insertId, affectedRows}]. */
export function query(sql, params) {
  return Promise.resolve().then(() => execSql(sql, params))
}

/** Synchronous variant (for ai-worker CLI / inline code). */
export function querySync(sql, params) {
  return execSql(sql, params)
}

/** Drop-in for mysql.createPool(...): bundle code keeps `await pool.query(...)`. */
export function createPool() {
  return {
    query: (sql, params) => query(sql, params),
    execute: (sql, params) => query(sql, params),
    end: () => Promise.resolve(),
    getConnection: () =>
      Promise.resolve({
        query: (sql, params) => query(sql, params),
        release: () => {},
      }),
  }
}

// ── vector helpers (embedding stored as Float32Array BLOB) ──────────────────
const EMBED_DIM = Number(process.env.EMBEDDING_DIM || 2048)

/** Serialize a Float32Array embedding to a BLOB for storage. */
export function embedToBlob(embedding) {
  const f32 = embedding instanceof Float32Array ? embedding : Float32Array.from(embedding)
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)
}

/** Read a stored BLOB back to Float32Array. */
export function blobToEmbed(blob) {
  if (blob == null) return null
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

/** Insert chunks for a paper: [{ section, content, embedding }]. Returns count. */
export function insertChunks(paperId, chunks) {
  const db = getDb()
  const stmt = db.prepare(
    'INSERT INTO paper_chunk (paper_id, section, content, embedding) VALUES (?, ?, ?, ?)',
  )
  for (const c of chunks) {
    stmt.run(paperId, c.section ?? null, c.content, embedToBlob(c.embedding))
  }
  return chunks.length
}

/** Cosine-search paper_chunk: returns rows {paper_id, section, content, score}. */
export function searchChunks(embedding, { paperIds = null, limit = 10 } = {}) {
  const target = embedding instanceof Float32Array ? embedding : Float32Array.from(embedding)
  const db = getDb()
  let rows
  if (paperIds && paperIds.length) {
    const placeholders = paperIds.map(() => '?').join(',')
    rows = db.prepare(`SELECT id, paper_id, section, content, embedding FROM paper_chunk WHERE paper_id IN (${placeholders})`).all(...paperIds)
  } else {
    rows = db.prepare('SELECT id, paper_id, section, content, embedding FROM paper_chunk').all()
  }
  const scored = []
  for (const r of rows) {
    const v = blobToEmbed(r.embedding)
    if (!v || v.length !== target.length) continue
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < target.length; i++) {
      dot += target[i] * v[i]
      na += target[i] * target[i]
      nb += v[i] * v[i]
    }
    if (na === 0 || nb === 0) continue
    scored.push({ id: r.id, paper_id: r.paper_id, section: r.section, content: r.content, score: dot / (Math.sqrt(na) * Math.sqrt(nb)) })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

/** Delete all chunks of a paper. Returns deleted count. */
export function deleteChunksByPaper(paperId) {
  const db = getDb()
  const r = db.prepare('DELETE FROM paper_chunk WHERE paper_id = ?').run(paperId)
  return Number(r.changes)
}
