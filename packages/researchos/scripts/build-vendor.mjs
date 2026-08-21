#!/usr/bin/env node
// Build the literature-search-mcp vendor when its dist is missing.
// Runs from `pnpm install` postinstall AND lazily from researchos-bootstrap.
// Idempotent: skips when dist/server.js exists; never forces a rebuild.
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VENDOR_DIR = join(__dirname, '..', 'external-search', 'vendor', 'literature-search-mcp')
const VENDOR_DIST = join(VENDOR_DIR, 'dist', 'server.js')

if (existsSync(VENDOR_DIST)) {
  process.exit(0)
}
if (!existsSync(join(VENDOR_DIR, 'package.json'))) {
  process.stderr.write('[researchos] vendor literature-search-mcp missing; skipping\n')
  process.exit(0)
}

process.stderr.write('[researchos] building literature-search-mcp vendor (first install)\n')
mkdirSync(VENDOR_DIR, { recursive: true })
if (!existsSync(join(VENDOR_DIR, 'node_modules'))) {
  execSync('npm install --no-audit --no-fund', { cwd: VENDOR_DIR, stdio: 'inherit' })
}
execSync('npm run build', { cwd: VENDOR_DIR, stdio: 'inherit' })
if (!existsSync(VENDOR_DIST)) {
  process.stderr.write(`[researchos] ERROR: vendor build produced no ${VENDOR_DIST}\n`)
  process.exit(1)
}
