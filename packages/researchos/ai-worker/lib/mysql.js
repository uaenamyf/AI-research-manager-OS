// AI-worker helpers: filesystem paper index reads, status updates via the
// papers-store, and direct SQLite operations on paper_chunk (vectors) / ai_task.
// paper 元数据已迁出 SQLite 到 ~/.researchos/papers/index.json ——
// worker 通过 papers-store 读取 / 更新元数据，向量块仍存 SQLite。
// @module @researchos/dsh-research-ai-worker/lib/mysql

import { createPool } from '../../lib/db.js'
import {
  getPaper as storeGetPaper,
  patchPaper as storePatchPaper,
} from '../../lib/papers-store.js'
import { readResearchFromDsh } from './settings.js'

export function createMysqlPool() {
  return createPool()
}

/** Read paper record from filesystem index; null when missing. */
export async function getPaperRow(pool, paperId) {
  const p = await storeGetPaper(String(paperId))
  if (!p) return null
  return {
    id: p.id,
    project_id: Number(p.projectId),
    user_id: Number(p.userId),
    pdf_url: p.localPdf || p.sourceUrl || null,
    status: p.status,
    summary: p.paperCard || null,
    error: p.error || null,
    localPdf: p.localPdf || null,
    sourceUrl: p.sourceUrl || null,
    title: p.title,
  }
}

/** Update paper status (and optionally paperCard / error) via filesystem store. */
export async function setPaperStatus(pool, paperId, status, { summary, error } = {}) {
  const patch = { status }
  if (summary !== undefined) patch.paperCard = summary
  if (error !== undefined) patch.error = error
  await storePatchPaper(String(paperId), patch)
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
  const out = []
  for (const id of paperIds) {
    const p = await storeGetPaper(String(id))
    if (p) out.push({ id: p.id, title: p.title, authors: p.authors, year: p.year, summary: p.paperCard || null })
  }
  return out
}

/**
 * Read user research settings (LLM/Embedding baseUrl/apiKey/model) for ai-worker
 * override logic. Order: DSH settings/credentials (primary) → legacy SQLite
 * app_user.settings (compat). Returns { llm?: {...}, embedding?: {...} }.
 */
export async function getUserResearchSettings(pool, userId) {
  // DSH settings/credentials (same path as server bundle uses)
  let fromDsh = null
  try {
    fromDsh = readResearchFromDsh()
  } catch {
    fromDsh = null
  }
  if (fromDsh && (fromDsh.llm || fromDsh.embedding)) return fromDsh
  // Legacy SQLite fallback
  try {
    const [rows] = await pool.query('SELECT settings FROM app_user WHERE id = ?', [userId])
    if (rows.length) {
      const s = JSON.parse(rows[0].settings || '{}')
      if (s.research && (s.research.llm || s.research.embedding)) return s.research
    }
  } catch { /* no legacy settings */ }
  return {}
}
