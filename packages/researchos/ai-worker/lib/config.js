// research-ai-worker config: env vars with built-in defaults. 2026-08-21:
// research config lives in the UI (设置 → 研究区大模型 → DSH settings.yaml +
// .credentials.yaml) — there is no .env to read anymore.
// @module @researchos/dsh-research-ai-worker/lib/config

// unified LLM/Embedding gateway (research-llm-gateway bundle inside dsh)
export const GATEWAY = (process.env.RESEARCH_GATEWAY_URL || 'http://127.0.0.1:3080').replace(/\/+$/, '')

export const LLM_MODEL = process.env.RESEARCH_LLM_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'ark-code-latest'
export const EMBED_MODEL =
  process.env.RESEARCH_EMBED_MODEL || process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'

// chunking params mirror ai-service app/core/config.py
export const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 512)
export const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP || 64)

// 2026-08-21 uaenamyf: default must match research-paper bundle's default
// (paper.js: 'dev-internal-token') — both sides fall back to this value so
// triggerAnalyze/triggerCleanup authenticate on a fresh clone.
export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.RESEARCH_INTERNAL_TOKEN || 'dev-internal-token'

export function logger() {
  return {
    info: (...a) => console.log('[ai-worker]', ...a),
    warn: (...a) => console.warn('[ai-worker]', ...a),
    error: (...a) => console.error('[ai-worker]', ...a),
  }
}
