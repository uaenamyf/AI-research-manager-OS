// Embedding via the unified gateway /v1/embeddings (batch 10, 1s between
// batches, exponential backoff on 429) — mirror ai-service/app/rag/embedding.py.
// @module @researchos/dsh-research-ai-worker/lib/embed

import { GATEWAY, EMBED_MODEL } from './config.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function embedOnce(batch, log) {
  const maxRetries = 5
  let delay = 2000
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${GATEWAY}/v1/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: batch, model: EMBED_MODEL }),
        signal: AbortSignal.timeout(90000),
      })
      if (!res.ok) throw new Error(`gateway embeddings HTTP ${res.status}: ${await res.text()}`)
      const j = await res.json()
      let data = Array.isArray(j.data) ? [...j.data] : []
      if (data.length && typeof data[0].index === 'number') {
        data.sort((a, b) => a.index - b.index)
      }
      const embs = data.map((d) => d.embedding)
      if (embs.length !== batch.length) {
        throw new Error(`embedding count mismatch: got ${embs.length}, want ${batch.length}`)
      }
      return embs
    } catch (e) {
      const isRateLimit = /429|RateLimit|TooManyRequests/i.test(String(e.message))
      if (isRateLimit && attempt < maxRetries) {
        log?.warn?.(`embedding rate-limited, retry in ${delay / 1000}s (${attempt}/${maxRetries})`)
        await sleep(delay)
        delay *= 2
        continue
      }
      throw e
    }
  }
  throw new Error('embedding retries exhausted')
}

export async function embedBatch(texts, log) {
  if (!texts.length) return []
  const BATCH_SIZE = 10
  const results = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    results.push(...(await embedOnce(batch, log)))
    if (i + BATCH_SIZE < texts.length) await sleep(1000)
  }
  return results
}
