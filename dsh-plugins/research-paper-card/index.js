// Phase 3 research-paper-card: ResearchOS Paper Intelligence Card generation
// bundle running inside dsh.
//
// Purpose: serve the SAME contract the ai-service paper_agent exposes, as a
// dsh-native endpoint whose LLM call goes through the SHARED LLM gateway
// (requirement 3). Prompts are copied verbatim from
// ai-service/app/agents/prompts/paper_card.py so the card schema stays
// identical (title/authors/year/doi/keywords/abstract/workflow/method/finding/
// limitation/future_work/tags).
//
// Route (mounted on the dsh webserver, prefix /research-paper-card):
//   POST /research-paper-card/generate   { text } -> card object   (JWT)
//
// Generation (mirror ai-service paper_agent):
//   - text truncated to 12000 chars before prompting
//   - LLM returns strict JSON (prompt enforces); markdown fences tolerated
//   - missing fields filled with schema defaults
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_GATEWAY_URL   (shared gateway root, default http://127.0.0.1:3081)
//   RESEARCH_LLM_MODEL     (chat model, default ark-code-latest)
//   JWT_SECRET             (shared with backend; fallback = backend yml default)
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE (for the user-existence auth check)
// @module @researchos/dsh-research-paper-card

import jwt from 'jsonwebtoken'
import mysql from 'mysql2/promise'

export const name = 'research-paper-card'

export const inject = ['webServer']

const DB = {
  host: process.env.RESEARCH_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.RESEARCH_MYSQL_PORT || 3306),
  user: process.env.RESEARCH_MYSQL_USER || 'researchos',
  password: process.env.RESEARCH_MYSQL_PASSWORD || 'researchos',
  database: process.env.RESEARCH_MYSQL_DATABASE || 'researchos',
}

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

const GATEWAY = (process.env.RESEARCH_GATEWAY_URL || 'http://127.0.0.1:3081').replace(/\/+$/, '')
const MODEL = process.env.RESEARCH_LLM_MODEL || 'ark-code-latest'

const MAX_TEXT_CHARS = 12000

// ── prompts (verbatim from ai-service/app/agents/prompts/paper_card.py) ────

const PAPER_CARD_SYSTEM = `You are a research paper analyst. Your task is to read a research paper and extract a structured summary called a "Paper Intelligence Card".

You must respond in VALID JSON format only, with no markdown formatting, no code blocks, no explanation before or after.

The JSON must contain exactly these fields:
{
  "title": "Full paper title",
  "authors": "Author names, comma-separated",
  "year": 2024,
  "doi": "DOI if available, empty string if not",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "abstract": "Concise abstract in 2-4 sentences: motivation, what was done, and main outcome.",
  "workflow": "Research workflow in 4-8 sentences. Describe the ENTIRE experimental process step by step in chronological order: data collection, preprocessing, methodology/model, experiments, results and evaluation.",
  "method": "Core methodology in 2-3 sentences. What approach/technique did they use?",
  "finding": "Key findings in 2-3 sentences. What were the main results?",
  "limitation": "Limitations in 2-3 sentences. What are the weaknesses or constraints?",
  "future_work": "Future work in 2-3 sentences. What directions do they suggest?",
  "tags": [
    {"name": "深度学习", "category": "人工智能"},
    {"name": "信号处理", "category": "工程"}
  ]
}

Rules for "keywords":
- Extract 4-8 concise keywords that best represent the paper's topics.
- Use the same language as the paper (English paper -> English keywords, Chinese paper -> Chinese keywords).

Rules for "abstract":
- Write a concise abstract in the paper's language covering motivation, method, and main result.

Rules for "workflow":
- Describe the paper's complete experimental/research workflow in chronological order: data collection, preprocessing, methods, experiments, results, evaluation.
- Write 4-8 sentences in the paper's language.

Rules for "tags" (IMPORTANT):
- Generate 3-5 tags. Tags must be SPECIFIC enough to distinguish this paper from papers in other fields.
- "name" must be a concrete technique, method, or sub-field (e.g. Hidden Markov Models, Spectrogram Analysis, Passive Acoustic Monitoring, Transfer Learning, Animal Vocalization Classification). Ask yourself: "what makes this paper unique?" — that should drive the names.
- "category" is the single top-level broad domain the name belongs to (e.g. Artificial Intelligence, Engineering, Biology, Medicine, Mathematics). Use ONLY top-level domains, never sub-fields.
- FORBIDDEN: never use a broad domain as a "name". Words like "Artificial Intelligence", "Biology", "Engineering", "Machine Learning", "Deep Learning", "Acoustics", "Science" are too broad — they belong in "category" only.
- FORBIDDEN: "name" must never equal "category" (case-insensitive). E.g. {"name": "Artificial Intelligence", "category": "Artificial Intelligence"} is invalid.
- Do NOT copy the paper's keywords verbatim; interpret them one level up while keeping them specific.
- Good "name" examples: Hidden Markov Models, Spectrogram Analysis, Passive Acoustic Monitoring, Convolutional Neural Networks, Wildlife Conservation, Primate Behavior.
- Bad "name" examples (too broad): Artificial Intelligence, Biology, Engineering, Machine Learning, Acoustics, Research.
- Use the same language as the paper's abstract (English paper -> English tags, Chinese paper -> Chinese tags).

Rules:
- Respond with ONLY the JSON object, no other text.
- All field values must be strings except "year" which is an integer.
- If a field cannot be determined, use an empty string (or null for year).
- Be concise but informative.
- Write in the same language as the paper (English paper -> English summary, etc.).`

const PAPER_CARD_USER = `Please analyze the following research paper text and generate a Paper Intelligence Card.

[Paper Text]
{paper_text}

Respond with ONLY the JSON object.`

// ── helpers ────────────────────────────────────────────────────────────────

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function ok(res, data) {
  sendJson(res, 200, { code: 0, message: 'ok', data })
}

function fail(res, status, message) {
  sendJson(res, status, { code: status, message, data: null })
}

function extractToken(req) {
  const cookieHeader = req.headers.cookie || ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === 'access_token' && v.length) return v.join('=').trim()
  }
  const auth = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  return m ? m[1].trim() : null
}

async function currentUserId(pool, req) {
  const token = extractToken(req)
  if (!token) return null
  let claims
  try {
    claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return null
  }
  const [rows] = await pool.query('SELECT id FROM app_user WHERE id = ?', [claims.sub])
  if (!rows.length) return null
  return Number(rows[0].id)
}

async function callLLM(system, user) {
  const resp = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  })
  if (!resp.ok) throw new Error(`llm http ${resp.status}`)
  const j = await resp.json()
  const content = j?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('llm empty content')
  return content
}

/** Tolerant JSON parse mirroring paper_agent._parse_json_response. */
function parseCard(raw) {
  let text = String(raw).trim()
  if (text.startsWith('```')) {
    const lines = text.split('\n').slice(1)
    if (lines.length && lines[lines.length - 1].trim().startsWith('```')) lines.pop()
    text = lines.join('\n').trim()
  }
  let data = {}
  try {
    data = JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      try {
        data = JSON.parse(text.slice(start, end + 1))
      } catch {
        data = {}
      }
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {}
  const str = (v) => (v == null ? '' : String(v))
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t) => t && typeof t === 'object').map((t) => ({ name: str(t.name), category: str(t.category) }))
    : []
  return {
    title: str(data.title),
    authors: str(data.authors),
    year: typeof data.year === 'number' ? data.year : null,
    doi: str(data.doi),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(str) : [],
    abstract: str(data.abstract),
    workflow: str(data.workflow),
    method: str(data.method),
    finding: str(data.finding),
    limitation: str(data.limitation),
    future_work: str(data.future_work),
    tags,
  }
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = mysql.createPool(DB)
  ctx.logger.info(`[research-paper-card] loaded — paper card via shared gateway ${GATEWAY}, model ${MODEL}`)

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-paper-card',
    handler: async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
      const seg = (() => {
        const s = pathname.replace(/^\/research-paper-card\/?/, '')
        return s ? s.split('/') : []
      })()
      if (req.method !== 'POST' || seg[0] !== 'generate') return fail(res, 404, 'not found')

      const userId = await currentUserId(pool, req)
      if (userId === null) return fail(res, 401, 'unauthorized')

      let body
      try {
        body = await readJson(req)
      } catch {
        return fail(res, 400, 'invalid JSON body')
      }
      const text = String(body.text || '')
      if (!text.trim()) return fail(res, 400, 'text is required')
      try {
        const truncated = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text
        const userPrompt = PAPER_CARD_USER.replace('{paper_text}', truncated)
        const raw = await callLLM(PAPER_CARD_SYSTEM, userPrompt)
        return ok(res, parseCard(raw))
      } catch (e) {
        ctx.logger.warn(`[research-paper-card] generate error: ${e.message}`)
        return fail(res, 502, `AI service temporarily unavailable: ${e.message}`)
      }
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
  })
}

export default { name, inject, apply }
