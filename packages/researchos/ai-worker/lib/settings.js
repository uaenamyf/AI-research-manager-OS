// AI-worker user settings loader: reads ~/.dsh/settings.yaml + .credentials.yaml
// for research LLM/Embedding override. Same shape as server bundle uses.
// @module @deepseek-ai/dsh-research-ai-worker/lib/settings

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const SETTINGS_FILE = join(DSH_HOME, 'settings.yaml')
const CREDS_FILE = join(DSH_HOME, '.credentials.yaml')

function parseYamlBlock(block) {
  // Tiny YAML block parser for our flat settings.yaml structure (no nested
  // mapping ambiguity) — research: { llm: { baseUrl, model }, embedding: {...} }
  const out = {}
  if (!block) return out
  const sectionRe = /^  (\w+):\n((?:    [^\n]+\n|\n)*)/gm
  let m
  while ((m = sectionRe.exec(block))) {
    const name = m[1]
    const body = m[2]
    out[name] = {}
    const bu = body.match(/^    baseUrl:\s*['"]?([^'"\n]+)['"]?/m)
    const mo = body.match(/^    model:\s*['"]?([^'"\n]+)['"]?/m)
    if (bu) out[name].baseUrl = bu[1].trim()
    if (mo) out[name].model = mo[1].trim()
  }
  return out
}

/** Read the research section from DSH settings/credentials files.
 * Returns { llm?, embedding? } with baseUrl/model from settings, apiKey from credentials. */
export function readResearchFromDsh() {
  const result = {}
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = readFileSync(SETTINGS_FILE, 'utf8')
      const m = raw.match(/^research:\n((?:  [^\n]+\n|\n)*)/m)
      if (m) {
        Object.assign(result, parseYamlBlock(m[1]))
      }
    }
  } catch { /* ignore */ }
  try {
    if (existsSync(CREDS_FILE)) {
      const raw = readFileSync(CREDS_FILE, 'utf8')
      const llm = raw.match(/^research_llm_apiKey:\s*['"]?([^'"\n]+)['"]?/m)
      const emb = raw.match(/^research_embedding_apiKey:\s*['"]?([^'"\n]+)['"]?/m)
      if (llm) {
        if (!result.llm) result.llm = {}
        result.llm.apiKey = llm[1].trim()
      }
      if (emb) {
        if (!result.embedding) result.embedding = {}
        result.embedding.apiKey = emb[1].trim()
      }
    }
  } catch { /* ignore */ }
  return result
}
