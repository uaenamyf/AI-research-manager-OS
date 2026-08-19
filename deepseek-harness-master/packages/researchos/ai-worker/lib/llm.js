// LLM chat via the unified gateway, with optional per-request override
// (user custom baseUrl/apiKey/model -> direct call bypassing the gateway,
// falling back to the gateway default on failure) — mirrors the routing of
// ai-service llm/client.py and the research-writing bundle.
// @module @researchos/dsh-research-ai-worker/lib/llm

import { GATEWAY, LLM_MODEL } from './config.js'

export async function chatComplete(system, user, { override, timeoutMs = 180000 } = {}) {
  if (override?.baseUrl || override?.apiKey) {
    try {
      return await callOnce(system, user, override, timeoutMs)
    } catch (e) {
      // fall back to the system default (gateway) — mirror research-writing
      console.warn(`[ai-worker] llm override failed (${e.message}), falling back to gateway`)
    }
  }
  return callOnce(system, user, null, timeoutMs)
}

async function callOnce(system, user, override, timeoutMs) {
  let base = GATEWAY
  let model = LLM_MODEL
  const headers = { 'content-type': 'application/json' }
  if (override?.baseUrl) {
    base = String(override.baseUrl).replace(/\/+$/, '')
    if (override.apiKey) headers.authorization = `Bearer ${override.apiKey}`
    if (override.model) model = override.model
  } else if (override?.apiKey) {
    headers.authorization = `Bearer ${override.apiKey}`
    if (override.model) model = override.model
  }

  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`llm http ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  const content = j?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('llm empty content')
  return content
}
