#!/usr/bin/env node
// ResearchOS bootstrap for `pnpm dsh web` (source launch via tsx).
//
// Goal: a fresh clone reaches the research workbench with only
//   pnpm install && pnpm run build && pnpm dsh web
// no `make start-dsh`, no manual profile setup, no hand-built vendor.
//
// This module does two things, both idempotent:
//   1. Inject ResearchOS env vars into process.env BEFORE the dsh tree boots
//      (same set dsh-gateway.sh exported, minus port/patch specifics which the
//      CLI owns). Only keys present in packages/researchos/.env are applied;
//      a missing .env is fine — per-user research LLM/embedding config is the
//      primary path (Settings → 研究区大模型, persisted to SQLite), and the
//      gateway/worker fall back to built-in defaults.
//   2. Verify the literature-search-mcp vendor dist exists; if not, build it
//      (npm install && npm run build) so external-search bundle can import it.
//
// It never prints secrets. It exits non-zero only when a REQUIRED piece
// (vendor build) truly cannot be produced.
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
// packages/researchos/ (script lives at scripts/ under it)
const RESEARCHOS_DIR = join(__dirname, '..')
// repo root = 3 levels up from packages/researchos/scripts/
const REPO_ROOT = join(RESEARCHOS_DIR, '..', '..', '..')

const ENV_FILE = join(RESEARCHOS_DIR, '.env')
const VENDOR_DIR = join(RESEARCHOS_DIR, 'external-search', 'vendor', 'literature-search-mcp')
const VENDOR_DIST = join(VENDOR_DIR, 'dist', 'server.js')

/** Read a key from the researchos .env (never echoes the value); undefined when .env is absent. */
function envValue(key) {
  if (!existsSync(ENV_FILE)) return undefined
  try {
    const raw = readFileSync(ENV_FILE, 'utf8')
    for (const line of raw.split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m && m[1] === key) return m[2].trim()
    }
  } catch {
    /* unreadable .env — treated as absent */
  }
  return undefined
}

/** 1. Inject the same RESEARCH_* set dsh-gateway.sh exported, only when .env exists. */
function injectEnv() {
  const apiKey = envValue('OPENAI_API_KEY')
  if (apiKey) process.env.RESEARCH_LLM_API_KEY = apiKey
  const upstream = envValue('RESEARCH_LLM_UPSTREAM_BASE_URL') || envValue('OPENAI_BASE_URL')
  if (upstream) {
    process.env.RESEARCH_LLM_BASE_URL = upstream
    process.env.RESEARCH_EMBEDDING_BASE_URL = upstream
  }
  const model = envValue('OPENAI_DEFAULT_MODEL')
  if (model) process.env.RESEARCH_LLM_MODEL = model
  if (apiKey) process.env.RESEARCH_EMBEDDING_API_KEY = apiKey
  if (envValue('RESEARCH_DATA_DIR')) process.env.RESEARCH_DATA_DIR = envValue('RESEARCH_DATA_DIR')
  if (envValue('JWT_SECRET')) process.env.JWT_SECRET = envValue('JWT_SECRET')
  if (envValue('INTERNAL_TOKEN')) process.env.RESEARCH_INTERNAL_TOKEN = envValue('INTERNAL_TOKEN')
  if (envValue('RESEARCH_AI_INLINE')) process.env.RESEARCH_AI_INLINE = envValue('RESEARCH_AI_INLINE')
  if (envValue('RESEARCH_ANON_ENABLED')) process.env.RESEARCH_ANON_ENABLED = envValue('RESEARCH_ANON_ENABLED')
  if (envValue('RESEARCH_ANON_EMAIL')) process.env.RESEARCH_ANON_EMAIL = envValue('RESEARCH_ANON_EMAIL')
  if (envValue('RESEARCH_ANON_USER_ID')) process.env.RESEARCH_ANON_USER_ID = envValue('RESEARCH_ANON_USER_ID')
  process.env.RESEARCH_STORAGE_LOCAL_DIR ||= join(process.env.HOME || '', '.researchos', 'uploads')
  process.env.RESEARCH_WORKSPACE_DIR ||= REPO_ROOT
  // Gateway URL is computed at request time by bundles; leave unset so it uses
  // the CLI's actual port (default 3080), mirroring dsh-gateway.sh's port bump.
}

/** 2. Build the vendor literature-search-mcp when its dist is missing. */
function ensureVendorBuilt() {
  if (existsSync(VENDOR_DIST)) return
  if (!existsSync(VENDOR_DIR)) return
  process.stderr.write('[researchos] building literature-search-mcp vendor (first run)\n')
  mkdirSync(VENDOR_DIR, { recursive: true })
  if (!existsSync(join(VENDOR_DIR, 'node_modules'))) {
    execSync('npm install --no-audit --no-fund', { cwd: VENDOR_DIR, stdio: 'inherit' })
  }
  execSync('npm run build', { cwd: VENDOR_DIR, stdio: 'inherit' })
  if (!existsSync(VENDOR_DIST)) {
    throw new Error(`literature-search-mcp vendor build produced no ${VENDOR_DIST}`)
  }
}

export function bootstrapResearchOS() {
  injectEnv()
  ensureVendorBuilt()
}

// Direct `node scripts/researchos-bootstrap.mjs` run: bootstrap then exit.
if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.cwd(), process.argv[1] || '')) {
  bootstrapResearchOS()
}
