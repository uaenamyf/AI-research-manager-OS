// MySQL helpers: paper row load / status update, ai_task update, pool factory.
// The worker writes business tables directly (it replaces the backend's
// role in the AI pipeline; per plan.md Phase 5 the DSH bundle owns MySQL).
// @module @researchos/dsh-research-ai-worker/lib/mysql

import mysql from 'mysql2/promise'
import { MYSQL } from './config.js'

export function createMysqlPool() {
  return mysql.createPool(MYSQL)
}

export async function getPaperRow(pool, paperId) {
  const [rows] = await pool.query('SELECT id, project_id, user_id, pdf_url, status, summary FROM paper WHERE id = ?', [paperId])
  return rows[0] || null
}

export async function setPaperStatus(pool, paperId, status, { summary, error } = {}) {
  if (summary !== undefined) {
    await pool.query("UPDATE paper SET status = ?, summary = ? WHERE id = ?", [status, JSON.stringify(summary), paperId])
  } else if (error !== undefined) {
    await pool.query("UPDATE paper SET status = ?, summary = ? WHERE id = ?", [status, JSON.stringify({ error }) , paperId])
  } else {
    await pool.query('UPDATE paper SET status = ? WHERE id = ?', [status, paperId])
  }
}

export async function getTaskRow(pool, taskId) {
  const [rows] = await pool.query('SELECT task_id, user_id, type, status FROM ai_task WHERE task_id = ?', [taskId])
  return rows[0] || null
}

export async function setTaskResult(pool, taskId, status, { result, error } = {}) {
  if (status === 'SUCCESS') {
    await pool.query('UPDATE ai_task SET status = ?, result = ?, error = NULL WHERE task_id = ?', [status, JSON.stringify(result), taskId])
  } else {
    await pool.query('UPDATE ai_task SET status = ?, error = ? WHERE task_id = ?', [status, String(error || '').slice(0, 2000), taskId])
  }
}

export async function fetchPaperMetadata(pool, paperIds) {
  if (!paperIds.length) return []
  const placeholders = paperIds.map(() => '?').join(',')
  const [rows] = await pool.query(
    `SELECT id, title, authors, year, summary FROM paper WHERE id IN (${placeholders})`,
    paperIds,
  )
  const byId = new Map(rows.map((r) => [Number(r.id), r]))
  const ordered = []
  for (const pid of paperIds) {
    const row = byId.get(Number(pid))
    if (!row) continue
    ordered.push({
      id: Number(row.id),
      title: row.title || '(untitled)',
      authors: row.authors || '',
      year: row.year,
      summary: row.summary,
    })
  }
  return ordered
}
