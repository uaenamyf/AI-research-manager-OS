// Paper Intelligence Card generation — prompts verbatim from
// ai-service/app/agents/prompts/paper_card.py (already ported once in the
// research-paper-card bundle; kept here so the worker is self-contained).
// @module @researchos/dsh-research-ai-worker/lib/card

import { chatComplete } from './llm.js'

const MAX_TEXT_CHARS = 12000

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
- Use the same language as the paper's abstract (English paper -> English tags, Chinese paper -> Chinese tags).`

const PAPER_CARD_USER = `Please analyze the following research paper text and generate a Paper Intelligence Card.

[Paper Text]
{paper_text}

Respond with ONLY the JSON object.`

/** Tolerant JSON parse mirroring paper_agent._parse_json_response / paper-card bundle. */
export function parseCard(raw) {
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

export async function generateCard(fullText, { override } = {}) {
  const paperText = String(fullText).slice(0, MAX_TEXT_CHARS)
  const raw = await chatComplete(PAPER_CARD_SYSTEM, PAPER_CARD_USER.replace('{paper_text}', paperText), {
    override,
  })
  return parseCard(raw)
}
