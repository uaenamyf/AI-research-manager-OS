// Paper analysis pipeline (replaces ai-service _process_paper + MQ paper.analyze):
//   download PDF -> parse+chunk -> embed (gateway) -> write PG paper_chunk
//   -> generate Paper Card (LLM via gateway) -> update MySQL paper status/summary.
// On any failure the paper is marked FAILED (chunks inserted before a card
// failure remain, mirroring the legacy pipeline).
// @module @researchos/dsh-research-ai-worker/lib/analyze

import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'
import { GATEWAY, BACKEND_URL, INTERNAL_TOKEN, CHUNK_SIZE, CHUNK_OVERLAP, PG_URL, logger } from './config.js'
import { parseAndChunk, extractText } from './parser.js'
import { embedBatch } from './embed.js'
import { createVectorStore } from './vector.js'
import { generateCard } from './card.js'
import { createMysqlPool, getPaperRow, setPaperStatus } from './mysql.js'

const log = logger()

/** Download a PDF from a local path, an HTTP URL, or a storage key.
 *
 * Key resolution order (dual-phase: legacy backend still holds old PDFs):
 *   1. legacy backend  /api/files/{key}  (X-Internal-Token) — reliable full
 *      download for every file the backend stores (ai-service uses this path);
 *   2. dsh research-file /research-file/files/{key} — for files only the new
 *      local storage holds (uploaded via the DSH upload panel).
 * Mirrors ai-service _download_pdf. */
export async function downloadPdf(pdfUrl) {
  if (existsSync(pdfUrl)) return readFileSync(pdfUrl)

  if (/^https?:\/\//i.test(pdfUrl)) {
    const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(60000) })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    throw new Error(`pdf download HTTP ${res.status}`)
  }

  const key = pdfUrl.replace(/^\/+/, '')
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  const headers = INTERNAL_TOKEN ? { 'X-Internal-Token': INTERNAL_TOKEN } : {}

  // 1. legacy backend (authoritative during the dual phase)
  try {
    const res = await fetch(`${BACKEND_URL}/api/files/${encoded}`, {
      headers,
      signal: AbortSignal.timeout(60000),
    })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      log.info(`pdf downloaded via backend (${buf.length} bytes)`)
      return buf
    }
  } catch (e) {
    log.warn(`pdf via backend failed: ${e.message}`)
  }

  // 2. research-file (new local uploads)
  const res = await fetch(`${GATEWAY}/research-file/files/${encoded}`, {
    headers,
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`pdf download via research-file HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  log.info(`pdf downloaded via research-file (${buf.length} bytes)`)
  return buf
}

export async function analyzePaper(paperId) {
  const pool = createMysqlPool()
  const pgPool = new pg.Pool({ connectionString: PG_URL })
  try {
    const paper = await getPaperRow(pool, paperId)
    if (!paper) throw new Error(`paper ${paperId} not found`)
    log.info(`analyze start: paperId=${paperId}, pdf=${paper.pdf_url}`)

    // 1. download
    let pdfBytes
    try {
      pdfBytes = await downloadPdf(paper.pdf_url)
    } catch (e) {
      await setPaperStatus(pool, paperId, 'FAILED', { error: `pdf download failed: ${e.message}` })
      return { paperId, status: 'FAILED', reason: 'pdf download failed' }
    }

    // 2. parse + chunk
    const chunks = await parseAndChunk(pdfBytes, { chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP })
    if (!chunks.length) {
      await setPaperStatus(pool, paperId, 'FAILED', { error: 'pdf parse produced no content' })
      return { paperId, status: 'FAILED', reason: 'no content' }
    }
    log.info(`parsed ${chunks.length} chunks`)

    // 3. embed
    const embeddings = await embedBatch(chunks.map((c) => c.content), log)

    // 4. write PG paper_chunk
    const store = createVectorStore(pgPool)
    const inserted = await store.insertChunks(
      paperId,
      chunks.map((c, i) => ({ section: c.section, content: c.content, embedding: embeddings[i] })),
    )
    log.info(`inserted ${inserted} chunks (paper_id=${paperId})`)

    // 5. Paper Card from full text (card failure keeps chunks but marks FAILED)
    const fullText = await extractText(pdfBytes)
    let card
    try {
      card = await generateCard(fullText)
    } catch (e) {
      log.warn(`card generation failed: ${e.message}`)
      await setPaperStatus(pool, paperId, 'FAILED', { error: `card generation failed: ${e.message}` })
      return { paperId, status: 'FAILED', reason: 'card generation failed', chunks: inserted }
    }

    // 6. READY + summary
    await setPaperStatus(pool, paperId, 'READY', { summary: card })
    log.info(`analyze done: paperId=${paperId} READY (${inserted} chunks)`)
    return { paperId, status: 'READY', chunks: inserted, card }
  } catch (e) {
    log.error(`analyze failed: ${e.stack || e.message}`)
    try {
      await setPaperStatus(pool, paperId, 'FAILED', { error: String(e.message || e).slice(0, 2000) })
    } catch {
      /* ignore */
    }
    return { paperId, status: 'FAILED', reason: String(e.message || e) }
  } finally {
    await pool.end().catch(() => {})
    await pgPool.end().catch(() => {})
  }
}

export async function cleanupPaper(paperId) {
  const pgPool = new pg.Pool({ connectionString: PG_URL })
  try {
    const store = createVectorStore(pgPool)
    const deleted = await store.deleteByPaper(paperId)
    log.info(`cleanup done: paper_id=${paperId}, deleted ${deleted} chunks`)
    return { paperId, deleted }
  } finally {
    await pgPool.end().catch(() => {})
  }
}
