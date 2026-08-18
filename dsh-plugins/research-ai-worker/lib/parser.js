// PDF parse + section chunking: verbatim port of ai-service/app/parser/pdf_parser.py
// (extract_text via pdf-parse, split_by_section, sliding_window).
// @module @researchos/dsh-research-ai-worker/lib/parser

import pdfParse from 'pdf-parse'

// section heading regexes (case-insensitive), mirror pdf_parser.py
const SECTION_PATTERNS = {
  abstract: /^\s*abstract\b/i,
  introduction: /^\s*\d?\.?\s*introduction\b/i,
  methods: /^\s*\d?\.?\s*(methods?|materials\s+and\s+methods)\b/i,
  results: /^\s*\d?\.?\s*(results?|experiments?|evaluation)\b/i,
  discussion: /^\s*\d?\.?\s*discussion\b/i,
  conclusion: /^\s*\d?\.?\s*conclusion\b/i,
  references: /^\s*\d?\.?\s*references?\b/i,
  related_work: /^\s*\d?\.?\s*(related\s+work|background)\b/i,
}

export async function extractText(pdfBytes) {
  const data = await pdfParse(Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes))
  return data.text || ''
}

export function detectSection(line) {
  for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(line)) return section
  }
  return null
}

export function splitBySection(text) {
  const sections = {}
  let currentSection = 'other'
  let currentLines = []

  for (const line of String(text).split('\n')) {
    const detected = detectSection(line)
    if (detected) {
      if (currentLines.length) {
        sections[currentSection] = currentLines.join('\n').trim()
      }
      currentSection = detected
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  if (currentLines.length) {
    sections[currentSection] = currentLines.join('\n').trim()
  }
  return sections
}

export function slidingWindow(text, size = 512, overlap = 64) {
  if (text.length <= size) {
    return text.trim() ? [text] : []
  }
  const chunks = []
  const step = size - overlap
  let start = 0
  while (start < text.length) {
    const end = start + size
    const chunk = text.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    start += step
  }
  return chunks
}

/** Strip NUL and other control chars PostgreSQL rejects (pdf.js text
 *  extraction can emit 0x00 / C0 controls that PyMuPDF never produces). */
export function sanitize(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/** Parse a PDF buffer into [{section, content}] chunks (references skipped). */
export async function parseAndChunk(pdfBytes, { chunkSize = 512, chunkOverlap = 64 } = {}) {
  const text = await extractText(pdfBytes)
  const sections = splitBySection(text)
  const chunks = []
  for (const [section, content] of Object.entries(sections)) {
    if (!content) continue
    if (section === 'references') continue
    for (const piece of slidingWindow(content, chunkSize, chunkOverlap)) {
      const clean = sanitize(piece)
      if (clean) chunks.push({ section, content: clean })
    }
  }
  return chunks
}
