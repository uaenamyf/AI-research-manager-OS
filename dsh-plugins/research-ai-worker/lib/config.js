// research-ai-worker config: env vars with a minimal .env fallback so the CLI
// can run standalone (bundles get env injected by scripts/dsh-gateway.sh).
// @module @researchos/dsh-research-ai-worker/lib/config

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')

// Backfill any key missing from process.env from the repo .env. Some vars
// (RESEARCH_*) may already be injected by dsh-gateway.sh / the host env, but
// INTERNAL_TOKEN / MYSQL_PASSWORD / POSTGRES_* often live only in .env.
{
  const envFile = path.join(REPO_ROOT, '.env')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
}

export const MYSQL = {
  host: process.env.RESEARCH_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.RESEARCH_MYSQL_PORT || 3306),
  user: process.env.RESEARCH_MYSQL_USER || 'researchos',
  password: process.env.RESEARCH_MYSQL_PASSWORD || 'researchos',
  database: process.env.RESEARCH_MYSQL_DATABASE || 'researchos',
}

export const PG_URL =
  process.env.RESEARCH_PG_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'researchos'}:${
    process.env.POSTGRES_PASSWORD || 'researchos'
  }@127.0.0.1:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'researchos'}`

// unified LLM/Embedding gateway (research-llm-gateway bundle inside dsh)
export const GATEWAY = (process.env.RESEARCH_GATEWAY_URL || 'http://127.0.0.1:3080').replace(/\/+$/, '')

export const LLM_MODEL = process.env.RESEARCH_LLM_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'ark-code-latest'
export const EMBED_MODEL =
  process.env.RESEARCH_EMBED_MODEL || process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'

// chunking params mirror ai-service app/core/config.py
export const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 512)
export const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP || 64)

export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.RESEARCH_INTERNAL_TOKEN || ''
export const BACKEND_URL = process.env.RESEARCH_BACKEND_URL || 'http://127.0.0.1:8080'

export function logger() {
  return {
    info: (...a) => console.log('[ai-worker]', ...a),
    warn: (...a) => console.warn('[ai-worker]', ...a),
    error: (...a) => console.error('[ai-worker]', ...a),
  }
}
