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
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
// packages/researchos/ (script lives at scripts/ under it)
const RESEARCHOS_DIR = join(__dirname, '..')
// repo root = 2 levels up from packages/researchos/ (researchos → packages → root)
const REPO_ROOT = join(RESEARCHOS_DIR, '..', '..')

const VENDOR_DIR = join(RESEARCHOS_DIR, 'external-search', 'vendor', 'literature-search-mcp')
const VENDOR_DIST = join(VENDOR_DIR, 'dist', 'server.js')

/**
 * Inject ResearchOS runtime defaults. 2026-08-21: research config lives in the
 * UI (设置 → 研究区大模型, persisted to DSH settings.yaml + .credentials.yaml),
 * so there is no .env to read. These defaults keep the research workspace
 * functional on a fresh clone; per-user LLM/embedding keys come from the UI.
 */
function injectEnv() {
  // 无登录是研究区核心卖点 —— anon 引导默认开启。
  process.env.RESEARCH_ANON_ENABLED ||= '1'
  process.env.RESEARCH_STORAGE_LOCAL_DIR ||= join(process.env.HOME || '', '.researchos', 'uploads')
  process.env.RESEARCH_WORKSPACE_DIR ||= REPO_ROOT
  // Gateway URL is computed at request time by bundles; leave unset so it uses
  // the CLI's actual port (default 3080).
}

/** 1. Build the vendor literature-search-mcp when its dist is missing. */
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
