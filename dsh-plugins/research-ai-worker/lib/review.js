// Literature review generation (replaces ai-service review_agent + MQ
// review.generate): paper metadata -> cross-paper RAG over paper_chunk
// -> LLM via gateway -> update MySQL ai_task SUCCESS/FAILED.
// Prompts verbatim from ai-service/app/agents/prompts/review.py.
// @module @researchos/dsh-research-ai-worker/lib/review

import pg from 'pg'
import { logger, PG_URL } from './config.js'
import { embedBatch } from './embed.js'
import { createVectorStore } from './vector.js'
import { chatComplete } from './llm.js'
import { createMysqlPool, fetchPaperMetadata, setTaskResult } from './mysql.js'

const log = logger()

const REVIEW_TOP_K = 12
const SUMMARY_MAX_CHARS = 1500

const REVIEW_SYSTEM = `You are an academic research assistant specialized in writing literature reviews.

Your task is to synthesize multiple research papers into a coherent, well-structured Literature Review in Markdown format.

Rules:
- Base your review STRICTLY on the provided paper summaries and excerpts. Do not fabricate findings, numbers, or citations.
- Write in the same language as the provided topic/papers (English papers -> English review).
- Cite papers inline using the reference marker given for each paper (e.g., [P1], [P2]). Every claim tied to a specific paper must carry its marker.
- Compare and contrast the papers: highlight agreements, disagreements, methodological differences, and gaps.
- Do NOT simply list paper-by-paper summaries. Organize the review thematically around the topic.

Output a Markdown document with the following structure:
# <Review Title>

## Introduction
Brief framing of the topic and why it matters.

## Thematic Synthesis
Two or more thematic subsections comparing the papers. Use inline citations [P1], [P2], ...

## Methodological Comparison
Compare the methods/approaches across papers.

## Gaps and Future Directions
Identify limitations and open questions across the body of work.

## Conclusion
Concise takeaway.

## References
A numbered list mapping each marker to its paper, e.g.:
- [P1] Title — Authors (Year)

Respond with ONLY the Markdown document, no code fences, no commentary before or after.`

const REVIEW_USER = `Write a Literature Review on the following topic.

[TOPIC]
{topic}

[PAPERS]
{papers_block}

[RELEVANT EXCERPTS]
{excerpts_block}

Produce the Markdown Literature Review now.`

function buildPapersBlock(papers, markerMap) {
  const parts = []
  for (const p of papers) {
    const marker = markerMap.get(p.id)
    const year = p.year ?? 'n.d.'
    const header = `[${marker}] ${p.title} — ${p.authors} (${year})`
    const summaryText = formatSummary(p.summary)
    parts.push(summaryText ? `${header}\n${summaryText}` : header)
  }
  return parts.join('\n\n')
}

function formatSummary(summary) {
  if (!summary) return ''
  let data = summary
  if (typeof summary === 'string') {
    try {
      data = JSON.parse(summary)
    } catch {
      return String(summary).slice(0, SUMMARY_MAX_CHARS)
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return String(data).slice(0, SUMMARY_MAX_CHARS)
  }
  const fields = [
    ['Method', data.method],
    ['Finding', data.finding],
    ['Limitation', data.limitation],
    ['Future work', data.future_work],
  ]
  const lines = fields.filter(([, v]) => v).map(([label, v]) => `  - ${label}: ${v}`)
  return lines.join('\n').slice(0, SUMMARY_MAX_CHARS)
}

function buildExcerptsBlock(chunks, markerMap) {
  if (!chunks.length) return '(No relevant excerpts retrieved.)'
  return chunks
    .map((c) => `[${markerMap.get(c.paper_id) || '?'} | Section: ${c.section} | chunk_id=${c.id}]\n${c.content}`)
    .join('\n\n---\n\n')
}

function stripCodeFence(text) {
  let stripped = String(text).trim()
  if (stripped.startsWith('```')) {
    const lines = stripped.split('\n')
    lines.shift()
    if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop()
    stripped = lines.join('\n').trim()
  }
  return stripped
}

/** Generate a literature review for ai_task {taskId}, papers {paperIds}, topic. */
export async function generateReview(taskId, paperIds, topic, override) {
  const pool = createMysqlPool()
  const pgPool = new pg.Pool({ connectionString: PG_URL })
  try {
    // 1. paper metadata (ordered, only existing papers)
    const papers = await fetchPaperMetadata(pool, paperIds)
    if (!papers.length) throw new Error('no paper metadata found')

    const markerMap = new Map(papers.map((p, i) => [p.id, `P${i + 1}`]))
    const papersBlock = buildPapersBlock(papers, markerMap)

    // 2. cross-paper RAG
    const query = String(topic || '').trim() || 'core methods, findings and limitations'
    const [queryEmbedding] = await embedBatch([query], log)
    const store = createVectorStore(pgPool)
    const chunks = await store.searchMulti(paperIds, queryEmbedding, REVIEW_TOP_K)
    const excerptsBlock = buildExcerptsBlock(chunks, markerMap)
    log.info(`review: papers=${papers.length}, chunks=${chunks.length}, topic='${query.slice(0, 50)}'`)

    // 3. LLM (override with gateway fallback)
    const userPrompt = REVIEW_USER.replace('{topic}', topic || '(no specific topic; synthesize the common themes)')
      .replace('{papers_block}', papersBlock)
      .replace('{excerpts_block}', excerptsBlock)
    const markdown = stripCodeFence(await chatComplete(REVIEW_SYSTEM, userPrompt, { override }))

    // 4. SUCCESS
    await setTaskResult(pool, taskId, 'SUCCESS', { result: { markdown } })
    log.info(`review done: taskId=${taskId} SUCCESS (${markdown.length} chars)`)
    return { taskId, status: 'SUCCESS', length: markdown.length }
  } catch (e) {
    log.error(`review failed: ${e.stack || e.message}`)
    try {
      await setTaskResult(pool, taskId, 'FAILED', { error: String(e.message || e) })
    } catch {
      /* ignore */
    }
    return { taskId, status: 'FAILED', reason: String(e.message || e) }
  } finally {
    await pool.end().catch(() => {})
    await pgPool.end().catch(() => {})
  }
}
