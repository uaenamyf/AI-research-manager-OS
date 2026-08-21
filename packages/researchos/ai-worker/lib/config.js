// research-ai-worker config: env vars with a minimal .env fallback so the CLI
// can run standalone (bundles get env injected by scripts/dsh-gateway.sh / the
// researchos-bootstrap on `pnpm dsh web`).
// @module @researchos/dsh-research-ai-worker/lib/config

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Single-repo layout: config.js lives at packages/researchos/ai-worker/lib/,
// so the researchos .env is two levels up (ai-worker → researchos).
const RESEARCHOS_DIR = path.resolve(__dirname, '../..')
const REPO_ROOT = path.resolve(RESEARCHOS_DIR, '../..')

// Backfill any key missing from process.env from the researchos .env. Some vars
// (RESEARCH_*) may already be injected by dsh-gateway.sh / the host env, but
// INTERNAL_TOKEN / JWT_SECRET / ANON_* often live only in .env.
{
  const envFile = path.join(RESEARCHOS_DIR, '.env')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
}

// unified LLM/Embedding gateway (research-llm-gateway bundle inside dsh)
export const GATEWAY = (process.env.RESEARCH_GATEWAY_URL || 'http://127.0.0.1:3080').replace(/\/+$/, '')

export const LLM_MODEL = process.env.RESEARCH_LLM_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'ark-code-latest'
export const EMBED_MODEL =
  process.env.RESEARCH_EMBED_MODEL || process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'

// chunking params mirror ai-service app/core/config.py
export const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 512)
export const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP || 64)

// 2026-08-21 uaenamyf: default must match research-paper bundle's default
// (paper.js: 'dev-internal-token') — with no .env on a fresh clone, both sides
// fall back to this value so triggerAnalyze/triggerCleanup authenticate.
// A real .env INTERNAL_TOKEN overrides both.
export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.RESEARCH_INTERNAL_TOKEN || 'dev-internal-token'

export function logger() {
  return {
    info: (...a) => console.log('[ai-worker]', ...a),
    warn: (...a) => console.warn('[ai-worker]', ...a),
    error: (...a) => console.error('[ai-worker]', ...a),
  }
}
