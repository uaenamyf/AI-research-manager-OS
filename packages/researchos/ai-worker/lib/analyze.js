// Paper analysis pipeline (replaces ai-service _process_paper + MQ paper.analyze):
//   download PDF -> parse+chunk -> embed (gateway) -> write SQLite paper_chunk
//   -> generate Paper Card (LLM via gateway) -> update paper status/summary.
// On any failure the paper is marked FAILED (chunks inserted before a card
// failure remain, mirroring the legacy pipeline).
// @module @researchos/dsh-research-ai-worker/lib/analyze

import { readFileSync, existsSync } from 'node:fs'
import { GATEWAY, INTERNAL_TOKEN, CHUNK_SIZE, CHUNK_OVERLAP, logger } from './config.js'
import { parseAndChunk, extractText } from './parser.js'
import { embedBatch } from './embed.js'
import { createVectorStore } from './vector.js'
import { generateCard } from './card.js'
import { createMysqlPool, getPaperRow, setPaperStatus, getUserResearchSettings } from './mysql.js'

const log = logger()

/** Download a PDF from a local path, an HTTP URL, or a storage key.
 *
 * Key resolution (legacy backend retired 2026-08-19 — all PDFs now live in
 * dsh research-file local storage):
 *   1. dsh research-file /research-file/files/{key} (X-Internal-Token).
 * Mirrors ai-service _download_pdf. */
export async function downloadPdf(pdfUrl) {
  if (existsSync(pdfUrl)) return readFileSync(pdfUrl)

  if (/^https?:\/\//i.test(pdfUrl)) {
    // 2026-08-19 myf: 带上浏览器 UA / referer，避免 Wiley、EuropePMC 等外部源
    // 因反爬（裸 fetch 无 UA）拒绝下载 —— 与 research-external-search 代理一致。
    const upstreamHost = new URL(pdfUrl).host
    const res = await fetch(pdfUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'application/pdf,application/octet-stream,*/*',
        'accept-language': 'en-US,en;q=0.9',
        referer: `https://${upstreamHost}/`,
      },
      signal: AbortSignal.timeout(60000),
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    throw new Error(`pdf download HTTP ${res.status}`)
  }

  const key = pdfUrl.replace(/^\/+/, '')
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  const headers = INTERNAL_TOKEN ? { 'X-Internal-Token': INTERNAL_TOKEN } : {}

  // research-file (dsh local storage; legacy backend retired 2026-08-19)
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
  try {
    const paper = await getPaperRow(pool, paperId)
    if (!paper) throw new Error(`paper ${paperId} not found`)
    log.info(`analyze start: paperId=${paperId}, pdf=${paper.pdf_url}`)

    // 2026-08-20 myf: 用户「设置-模型-研究区大模型」自定义配置（论文解析 LLM /
    // 嵌入向量）。有配置时走 override（失败回退系统默认网关），无配置用默认。
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

    // 3. embed (user override or gateway default)
    const embeddings = await embedBatch(chunks.map((c) => c.content), log, embedOverride)

    // 4. write SQLite paper_chunk
    const store = createVectorStore()
    const inserted = await store.insertChunks(
      paperId,
      chunks.map((c, i) => ({ section: c.section, content: c.content, embedding: embeddings[i] })),
    )
    log.info(`inserted ${inserted} chunks (paper_id=${paperId})`)

    // 5. Paper Card from full text (card failure keeps chunks but marks FAILED)
    const fullText = await extractText(pdfBytes)
    let card
    try {
      card = await generateCard(fullText, { override: llmOverride })
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
  }
}

export async function cleanupPaper(paperId) {
  try {
    const store = createVectorStore()
    const deleted = await store.deleteByPaper(paperId)
    log.info(`cleanup done: paper_id=${paperId}, deleted ${deleted} chunks`)
    return { paperId, deleted }
  } finally {
    /* sqlite store needs no teardown */
  }
}
