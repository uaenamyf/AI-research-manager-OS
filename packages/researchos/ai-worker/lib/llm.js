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

  // 2026-08-21 uaenamyf: 用户填的 baseUrl 可能是 https://api.deepseek.com/v1
  //（已含 /v1）或 https://api.deepseek.com（不含）。前者若再拼 /v1 会变成
  // /v1/v1/chat/completions → 404 → 「AI service temporarily unavailable:
  // fetch fail」。按是否已以 /v1 结尾决定是否补路径，OpenAI 兼容端点两者皆可。
  const basePath = /\/v1$/i.test(base) ? '' : '/v1'
  const res = await fetch(`${base}${basePath}/chat/completions`, {
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
  if (!res.ok) {
    // 2026-08-21 uaenamyf: 提取上游/网关返回的 message（含「暂未配置 API Key…」中文提示），
    // 而非整段 JSON —— analyze FAILED / 综述 / 写作的错误信息更可读。
    const detail = await res.text().catch(() => '')
    let msg = `llm http ${res.status}`
    try {
      const j = JSON.parse(detail)
      if (j?.error?.message) msg = j.error.message
    } catch { /* non-JSON body — keep status-only */ }
    throw new Error(msg)
  }
  const j = await res.json()
  const content = j?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('llm empty content')
  return content
}
