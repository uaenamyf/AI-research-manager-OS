// Phase 0 LLM gateway spike: an OpenAI-compatible HTTP endpoint served by a
// dsh bundle. Requirement 3 (unified LLM/Embedding API) minimal loop:
//   POST /v1/chat/completions  -> ctx.llm.stream() (non-streaming JSON in P0)
//   POST /v1/embeddings        -> P0 stub (embedding adapter decision is Phase 1)
// Provider/model resolution: OpenAI payload `model` maps onto dsh's provider
// routes via a gateway config default (P0: config default, e.g. deepseek-official).
// @module @researchos/dsh-llm-gateway

export const name = 'research-llm-gateway'

export const inject = ['webServer', 'llm']


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

function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

export function apply(ctx, config) {
  const provider = config?.provider ?? 'deepseek-official'
  const model = config?.model ?? 'deepseek-v4-flash'
  ctx.logger.info(`[research-llm-gateway] loaded (provider=${provider}, model=${model})`)

  ctx.webServer.register({
    kind: 'exact',
    path: '/v1/chat/completions',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        return json(res, 405, { error: { message: 'method not allowed', type: 'invalid_request_error' } })
      }
      let body
      try {
        body = await readJson(req)
      } catch {
        return json(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } })
      }
      const model = body.model || model
      const messages = Array.isArray(body.messages) ? body.messages : []
      if (messages.length === 0) {
        return json(res, 400, { error: { message: 'messages is required', type: 'invalid_request_error' } })
      }

      const sys = messages.find((m) => m.role === 'system')?.content
      const chat = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }))

      try {
        const chunks = []
        let finishReason = 'stop'
        for await (const chunk of ctx.llm.stream({
          provider: provider,
          model,
          system: sys,
          messages: chat,
          temperature: body.temperature,
        })) {
          if (chunk.type === 'text-delta' && chunk.text) chunks.push(chunk.text)
          else if (chunk.type === 'finish') finishReason = chunk.reason ?? 'stop'
        }
        const content = chunks.join('')
        return json(res, 200, {
          id: `chatcmpl-researchos-${Date.now()}`,
          object: 'chat.completion',
          model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        })
      } catch (e) {
        ctx.logger.warn(`[research-llm-gateway] chat completion failed: ${e.message}`)
        return json(res, 502, {
          error: { message: `upstream LLM call failed: ${e.message}`, type: 'upstream_error' },
        })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/v1/embeddings',
    handler: async (req, res) => {
      // P0 stub: embedding adapter decision lands in Phase 1 (ctx.llm has no
      // embedding capability; ResearchOS PG vectors need a dedicated path).
      return json(res, 501, {
        error: { message: 'embeddings endpoint: Phase 1 (embedding adapter TBD)', type: 'not_implemented' },
      })
    },
  })
}

export default { name, inject, apply }
