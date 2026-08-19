import assert from "node:assert/strict"
import test from "node:test"
import { HttpClient, HttpRequestError, retryAfterMs } from "../src/http.js"

test("HTTP retries 408/429/5xx and honors numeric Retry-After", async () => {
  let calls = 0
  const waits: number[] = []
  const client = new HttpClient({
    fetch: async () => {
      calls++
      if (calls === 1) return new Response("busy", { status: 429, headers: { "retry-after": "2" } })
      return new Response("ok")
    },
    sleep: async (ms) => {
      waits.push(ms)
    },
  })
  assert.equal(await client.requestText("https://provider.test/search?api_key=secret"), "ok")
  assert.equal(calls, 2)
  assert.deepEqual(waits, [2_000])
})

test("Retry-After accepts HTTP dates and caps provider waits at 60 seconds", () => {
  const base = Date.parse("2026-01-01T00:00:00Z")
  assert.equal(retryAfterMs("Thu, 01 Jan 2026 00:00:03 GMT", 0, () => base), 3_000)
  assert.equal(retryAfterMs("999", 0), 60_000)
  assert.equal(retryAfterMs("Thu, 01 Jan 2026 01:00:00 GMT", 0, () => base), 60_000)
})

test("HTTP retries network failures and exhausts configured attempts", async () => {
  let calls = 0
  const client = new HttpClient({
    fetch: async () => {
      calls++
      throw new TypeError("socket closed")
    },
    sleep: async () => {},
  })
  await assert.rejects(client.requestText("https://provider.test/a", { retries: 2 }), (error: unknown) => {
    assert.ok(error instanceof HttpRequestError)
    assert.equal(error.kind, "network")
    assert.equal(error.retryable, true)
    return true
  })
  assert.equal(calls, 3)
})

test("HTTP does not retry terminal 4xx and sanitizes query strings", async () => {
  let calls = 0
  const client = new HttpClient({ fetch: async () => (calls++, new Response("not found", { status: 404 })) })
  await assert.rejects(client.requestText("https://provider.test/item?token=secret"), (error: unknown) => {
    assert.ok(error instanceof HttpRequestError)
    assert.equal(error.status, 404)
    assert.doesNotMatch(error.message, /secret/)
    assert.doesNotMatch(error.message, /token=/)
    return true
  })
  assert.equal(calls, 1)
})

test("HTTP GET cache is bounded by validity and can be cleared", async () => {
  let calls = 0
  const client = new HttpClient({ fetch: async () => (calls++, new Response("payload")) })
  assert.equal(await client.requestText("https://cache.test/a"), "payload")
  assert.equal(await client.requestText("https://cache.test/a"), "payload")
  assert.equal(calls, 1)
  client.clearCache()
  await client.requestText("https://cache.test/a")
  assert.equal(calls, 2)
})

test("HTTP does not cache empty bodies and rejects caller-invalid 2xx bodies", async () => {
  let calls = 0
  const client = new HttpClient({ fetch: async () => (calls++, new Response(calls <= 2 ? "" : "<html>bad</html>")) })
  await client.requestText("https://cache.test/empty")
  await client.requestText("https://cache.test/empty")
  await assert.rejects(
    client.requestText("https://cache.test/invalid", { looksValid: (body) => body.startsWith("{") }),
    (error: unknown) => error instanceof HttpRequestError && error.kind === "parse",
  )
  await assert.rejects(
    client.requestText("https://cache.test/invalid", { looksValid: (body) => body.startsWith("{") }),
    (error: unknown) => error instanceof HttpRequestError && error.kind === "parse",
  )
  assert.equal(calls, 4)
})

test("caller abort propagates without retries", async () => {
  let calls = 0
  const controller = new AbortController()
  const client = new HttpClient({
    fetch: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        calls++
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })
      }),
    sleep: async () => {},
  })
  const request = client.requestText("https://slow.test/a", { signal: controller.signal })
  controller.abort()
  await assert.rejects(request, (error: unknown) => error instanceof HttpRequestError && error.kind === "abort")
  assert.ok(calls <= 1)
})

test("internal timeout is typed and retryable", async () => {
  let calls = 0
  const client = new HttpClient({
    fetch: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        calls++
        init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), { once: true })
      }),
    sleep: async () => {},
  })
  await assert.rejects(client.requestText("https://slow.test/a", { timeoutMs: 5, retries: 1 }), (error: unknown) => {
    assert.ok(error instanceof HttpRequestError)
    assert.equal(error.kind, "timeout")
    return true
  })
  assert.equal(calls, 2)
})

test("caller abort is checked before serving a cached value", async () => {
  let calls = 0
  const client = new HttpClient({ fetch: async () => (calls++, new Response("cached")) })
  await client.requestText("https://cache.test/abort")
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    client.requestText("https://cache.test/abort", { signal: controller.signal }),
    (error: unknown) => error instanceof HttpRequestError && error.kind === "abort",
  )
  assert.equal(calls, 1)
})

test("custom HTTP options are not spread into native fetch", async () => {
  let received: Record<string, unknown> | undefined
  const client = new HttpClient({
    fetch: async (_input, init) => {
      received = init as unknown as Record<string, unknown>
      return new Response("ok")
    },
  })
  await client.requestText("https://options.test/a", {
    retries: 0,
    timeoutMs: 20,
    cacheTtlMs: 0,
    rateLimit: { maxConcurrent: 1 },
    looksValid: () => true,
  })
  for (const key of ["retries", "timeoutMs", "cacheTtlMs", "rateLimit", "looksValid"]) {
    assert.equal(received?.[key], undefined)
  }
})

test("host concurrency slot is released before retry backoff sleep", async () => {
  let releaseSleep: (() => void) | undefined
  let sleepStarted: (() => void) | undefined
  const sleeping = new Promise<void>((resolve) => {
    sleepStarted = resolve
  })
  const sleepGate = new Promise<void>((resolve) => {
    releaseSleep = resolve
  })
  let firstCalls = 0
  const client = new HttpClient({
    fetch: async (input) => {
      const url = String(input)
      if (url.endsWith("/first") && firstCalls++ === 0) return new Response("busy", { status: 429 })
      return new Response("ok")
    },
    sleep: async () => {
      sleepStarted?.()
      await sleepGate
    },
  })
  const first = client.requestText("https://slot.test/first", {
    cacheTtlMs: 0,
    retries: 1,
    rateLimit: { maxConcurrent: 1 },
  })
  await sleeping
  const second = client.requestText("https://slot.test/second", {
    cacheTtlMs: 0,
    retries: 0,
    rateLimit: { maxConcurrent: 1 },
  })
  assert.equal(await second, "ok")
  releaseSleep?.()
  assert.equal(await first, "ok")
})

test("per-host concurrency is enforced while different hosts remain independent", async () => {
  let active = 0
  let peak = 0
  const client = new HttpClient({
    fetch: async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active--
      return new Response("ok")
    },
  })
  await Promise.all([
    client.requestText("https://one.test/a", { cacheTtlMs: 0, rateLimit: { maxConcurrent: 1 } }),
    client.requestText("https://one.test/b", { cacheTtlMs: 0, rateLimit: { maxConcurrent: 1 } }),
  ])
  assert.equal(peak, 1)

  peak = 0
  await Promise.all([
    client.requestText("https://one.test/c", { cacheTtlMs: 0, rateLimit: { maxConcurrent: 1 } }),
    client.requestText("https://two.test/c", { cacheTtlMs: 0, rateLimit: { maxConcurrent: 1 } }),
  ])
  assert.equal(peak, 2)
})
