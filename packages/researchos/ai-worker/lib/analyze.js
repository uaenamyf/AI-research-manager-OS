// Paper analysis pipeline (post-filesystem-store):
//   read local PDF (papers/<projectId>/<paperId>.pdf) -> parse+chunk
//   -> embed (gateway or user override) -> write SQLite paper_chunk
//   -> generate Paper Card (LLM) -> update paper status + paperCard via
//   papers-store.
//
// 2026-08-21 myf: 重大重构
//   - paper 元数据从 SQLite paper 表迁到 ~/.researchos/papers/index.json
//   - PDF 始终本地（import 时下载到 papers/<projectId>/<paperId>.pdf）
//   - 删除 / upload 都触发 ai-worker 异步清理 paper_chunk
//   - 不再自动触发 analyze —— 用户在 Paper Card 区手动点「▶ 解析」
//
// @module @deepseek-ai/dsh-research-ai-worker/lib/analyze

import { readFileSync } from 'node:fs'
import { GATEWAY, logger } from './config.js'
import { parseAndChunk, extractText } from './parser.js'
import { embedBatch } from './embed.js'
import { createVectorStore } from './vector.js'
import { generateCard } from './card.js'
import { createMysqlPool, getPaperRow, setPaperStatus, getUserResearchSettings } from './mysql.js'
import { localPdfPath } from '../../lib/papers-store.js'

const log = logger()

/** Read a paper's local PDF bytes (papers/<projectId>/<paperId>.pdf).
 * Throws when the file is missing (e.g. metadata index out of sync with disk). */
export function readLocalPdf(paper) {
  if (!paper.localPdf && !paper.sourceUrl) {
    throw new Error('paper has no local PDF and no source URL')
  }
  if (paper.localPdf) {
    // localPdf is "<projectId>/<paperId>.pdf" relative to ~/.researchos/papers/
    const abs = localPdfPath(paper.id, paper.project_id)
    return readFileSync(abs)
  }
  // legacy safety: paper without localPdf but with sourceUrl (shouldn't occur
  // post-filesystem-refactor) — re-download.
  throw new Error(`local PDF missing for paper ${paper.id}; re-import the paper`)
}

export async function analyzePaper(paperId) {
  const pool = createMysqlPool()
  try {
    const paper = await getPaperRow(pool, paperId)
    if (!paper) throw new Error(`paper ${paperId} not found`)
    log.info(`analyze start: paperId=${paperId} title="${paper.title}"`)

    // 用户「设置-模型-研究区大模型」自定义配置：有配置时走 override。
    const userCfg = await getUserResearchSettings(pool, paper.user_id)
    const llmOverride = userCfg.llm && (userCfg.llm.baseUrl || userCfg.llm.apiKey)
      ? { baseUrl: userCfg.llm.baseUrl, apiKey: userCfg.llm.apiKey, model: userCfg.llm.model }
      : undefined
    const embedOverride = userCfg.embedding && (userCfg.embedding.baseUrl || userCfg.embedding.apiKey)
      ? { baseUrl: userCfg.embedding.baseUrl, apiKey: userCfg.embedding.apiKey, model: userCfg.embedding.model }
      : undefined
    if (llmOverride || embedOverride) {
      log.info(`analyze override: llm=${!!llmOverride} embed=${!!embedOverride}`)
    }

    // 1. read local PDF
    let pdfBytes
    try {
      pdfBytes = readLocalPdf(paper)
    } catch (e) {
      await setPaperStatus(pool, paperId, 'FAILED', { error: `local pdf missing: ${e.message}` })
      return { paperId, status: 'FAILED', reason: 'local pdf missing' }
    }

    // 2. parse + chunk
    const chunks = await parseAndChunk(pdfBytes, { chunkSize: 512, chunkOverlap: 64 })
    if (!chunks.length) {
      await setPaperStatus(pool, paperId, 'FAILED', { error: 'pdf parse produced no content' })
      return { paperId, status: 'FAILED', reason: 'no content' }
    }
    log.info(`parsed ${chunks.length} chunks`)

    // 3. embed
    const embeddings = await embedBatch(chunks.map((c) => c.content), log, embedOverride)

    // 4. write paper_chunk (vectors in SQLite; paper_id is the new TEXT id)
    const store = createVectorStore()
    const inserted = await store.insertChunks(
      String(paperId),
      chunks.map((c, i) => ({ section: c.section, content: c.content, embedding: embeddings[i] })),
    )
    log.info(`inserted ${inserted} chunks (paper_id=${paperId})`)

    // 5. Paper Card from full text
    const fullText = await extractText(pdfBytes)
    let card
    try {
      card = await generateCard(fullText, { override: llmOverride })
    } catch (e) {
      log.warn(`card generation failed: ${e.message}`)
      await setPaperStatus(pool, paperId, 'FAILED', { error: `card generation failed: ${e.message}` })
      return { paperId, status: 'FAILED', reason: 'card generation failed', chunks: inserted }
    }

    // 6. READY + paperCard
    await setPaperStatus(pool, paperId, 'READY', { summary: card })
    log.info(`analyze done: paperId=${paperId} READY (${inserted} chunks)`)
    return { paperId, status: 'READY', chunks: inserted, card }
  } catch (e) {
    log.error(`analyze failed: ${e.stack || e.message}`)
    try {
      await setPaperStatus(pool, paperId, 'FAILED', { error: String(e.message || e).slice(0, 2000) })
    } catch { /* ignore */ }
    return { paperId, status: 'FAILED', reason: String(e.message || e) }
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function cleanupPaper(paperId) {
  try {
    const store = createVectorStore()
    const deleted = await store.deleteByPaper(String(paperId))
    log.info(`cleanup done: paper_id=${paperId}, deleted ${deleted} chunks`)
    return { paperId, deleted }
  } catch (e) {
    log.error(`cleanup failed: paper_id=${paperId} err=${e.message}`)
    throw e
  }
}
