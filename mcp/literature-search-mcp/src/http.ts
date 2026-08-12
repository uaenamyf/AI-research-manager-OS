import { createHash } from "node:crypto"

const MAX_CACHE_TTL_MS = 5 * 60_000
const MAX_CACHE_ENTRIES = 256

export type HttpErrorKind = "http" | "network" | "timeout" | "abort" | "parse"

export class HttpRequestError extends Error {
  readonly kind: HttpErrorKind
  readonly status?: number
  readonly retryable: boolean

  constructor(message: string, options: { kind: HttpErrorKind; status?: number; retryable: boolean; cause?: unknown }) {
    super(message, { cause: options.cause })
    this.name = "HttpRequestError"
    this.kind = options.kind
    this.status = options.status
    this.retryable = options.retryable
  }
}

export interface RateLimit {
  minIntervalMs?: number
  maxConcurrent?: number
}

export interface HttpRequestOptions extends Omit<RequestInit, "signal"> {
  signal?: AbortSignal
  timeoutMs?: number
  retries?: number
  cacheTtlMs?: number
  rateLimit?: RateLimit
  looksValid?: (body: string) => boolean
}

interface CacheEntry {
  expiresAt: number
  body: string
}

interface QueueItem {
  resolve: (release: () => void) => void
  reject: (error: unknown) => void
  signal?: AbortSignal
  onAbort?: () => void
}

interface HostState {
  active: number
  nextStartAt: number
  queue: QueueItem[]
  timer?: NodeJS.Timeout
}

export interface HttpClientOptions {
  fetch?: typeof globalThis.fetch
  userAgent?: string
  timeoutMs?: number
  retries?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  now?: () => number
}

export class HttpClient {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly userAgent: string
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly sleepImpl: (ms: number, signal?: AbortSignal) => Promise<void>
  private readonly now: () => number
  private readonly cache = new Map<string, CacheEntry>()
  private readonly hosts = new Map<string, HostState>()

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.userAgent = options.userAgent ?? "literature-search-mcp/1.0 (Node.js)"
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.retries = options.retries ?? 3
    this.sleepImpl = options.sleep ?? abortableSleep
    this.now = options.now ?? Date.now
  }

  async getJson<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    const body = await this.requestText(url, {
      ...options,
      headers: { Accept: "application/json", ...headersRecord(options.headers) },
    })
    try {
      return JSON.parse(body) as T
    } catch (error) {
      throw new HttpRequestError(`Invalid JSON from ${safeEndpoint(url)}`, {
        kind: "parse",
        retryable: false,
        cause: error,
      })
    }
  }

  async requestText(url: string, options: HttpRequestOptions = {}): Promise<string> {
    const {
      signal,
      timeoutMs = this.timeoutMs,
      retries: configuredRetries = this.retries,
      cacheTtlMs,
      rateLimit,
      looksValid,
      ...nativeOptions
    } = options
    if (signal?.aborted) throw abortError(url, signal.reason)

    const method = (nativeOptions.method ?? "GET").toUpperCase()
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "*/*",
      ...headersRecord(nativeOptions.headers),
    }
    const ttl = method === "GET" ? Math.max(0, Math.min(cacheTtlMs ?? MAX_CACHE_TTL_MS, MAX_CACHE_TTL_MS)) : 0
    const cacheKey = ttl > 0 ? cacheKeyFor(method, url, headers) : undefined
    const cached = cacheKey ? this.cache.get(cacheKey) : undefined
    if (signal?.aborted) throw abortError(url, signal.reason)
    if (cached && cached.expiresAt > this.now()) return cached.body
    if (cached && cacheKey) this.cache.delete(cacheKey)

    const retries = Math.max(0, configuredRetries)
    let lastError: HttpRequestError | undefined

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw abortError(url, signal.reason)
      const release = await this.acquire(url, rateLimit, signal)
      if (signal?.aborted) {
        release()
        throw abortError(url, signal.reason)
      }
      const controller = new AbortController()
      let timedOut = false
      let waitMs: number | undefined
      const timeout = setTimeout(() => {
        timedOut = true
        controller.abort(new DOMException("Request timed out", "TimeoutError"))
      }, timeoutMs)
      const combined = combineSignals(controller.signal, signal)

      try {
        const response = await this.fetchImpl(url, { ...nativeOptions, method, headers, signal: combined.signal })
        const body = await response.text()
        if (!response.ok) {
          const retryable = isRetryableStatus(response.status)
          const error = new HttpRequestError(`HTTP ${response.status} from ${safeEndpoint(url)}`, {
            kind: "http",
            status: response.status,
            retryable,
          })
          if (!retryable || attempt === retries) throw error
          lastError = error
          waitMs = retryAfterMs(response.headers.get("retry-after"), attempt, this.now)
        } else {
          if (looksValid && !looksValid(body)) {
            throw new HttpRequestError(`Invalid response body from ${safeEndpoint(url)}`, {
              kind: "parse",
              retryable: false,
            })
          }
          if (cacheKey && body.trim().length > 0) this.putCache(cacheKey, { body, expiresAt: this.now() + ttl })
          return body
        }
      } catch (error) {
        if (error instanceof HttpRequestError) throw error
        if (signal?.aborted) throw abortError(url, error)
        const normalized = timedOut
          ? new HttpRequestError(`Request timed out for ${safeEndpoint(url)}`, {
              kind: "timeout",
              retryable: true,
              cause: error,
            })
          : new HttpRequestError(`Network request failed for ${safeEndpoint(url)}`, {
              kind: "network",
              retryable: true,
              cause: error,
            })
        lastError = normalized
        if (attempt === retries) throw normalized
        waitMs = retryAfterMs(undefined, attempt, this.now)
      } finally {
        clearTimeout(timeout)
        combined.cleanup()
        release()
      }

      if (waitMs !== undefined) await this.sleepImpl(waitMs, signal)
    }

    throw lastError ?? new HttpRequestError(`Request failed for ${safeEndpoint(url)}`, { kind: "network", retryable: true })
  }

  clearCache(): void {
    this.cache.clear()
  }

  resetRateLimits(): void {
    for (const state of this.hosts.values()) {
      if (state.timer) clearTimeout(state.timer)
      for (const item of state.queue) item.reject(new Error("HTTP rate limiter reset"))
    }
    this.hosts.clear()
  }

  private putCache(key: string, entry: CacheEntry): void {
    this.pruneCache()
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value as string | undefined
      if (oldest) this.cache.delete(oldest)
    }
    this.cache.set(key, entry)
  }

  private pruneCache(): void {
    const now = this.now()
    for (const [key, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(key)
  }

  private acquire(url: string, limit: RateLimit | undefined, signal?: AbortSignal): Promise<() => void> {
    const host = new URL(url).host
    const maxConcurrent = Math.max(1, limit?.maxConcurrent ?? 4)
    const minIntervalMs = Math.max(0, limit?.minIntervalMs ?? 0)
    const state = this.hosts.get(host) ?? { active: 0, nextStartAt: 0, queue: [] }
    this.hosts.set(host, state)

    return new Promise<() => void>((resolve, reject) => {
      const item: QueueItem = { resolve, reject, signal }
      if (signal?.aborted) return reject(abortError(url, signal.reason))
      item.onAbort = () => {
        const index = state.queue.indexOf(item)
        if (index >= 0) state.queue.splice(index, 1)
        reject(abortError(url, signal?.reason))
      }
      signal?.addEventListener("abort", item.onAbort, { once: true })
      state.queue.push(item)
      this.drainHost(state, maxConcurrent, minIntervalMs)
    })
  }

  private drainHost(state: HostState, maxConcurrent: number, minIntervalMs: number): void {
    if (state.timer || state.active >= maxConcurrent || state.queue.length === 0) return
    const wait = Math.max(0, state.nextStartAt - this.now())
    if (wait > 0) {
      state.timer = setTimeout(() => {
        state.timer = undefined
        this.drainHost(state, maxConcurrent, minIntervalMs)
      }, wait)
      return
    }

    const item = state.queue.shift()
    if (!item) return
    item.signal?.removeEventListener("abort", item.onAbort as () => void)
    if (item.signal?.aborted) {
      item.reject(abortError("request", item.signal.reason))
      this.drainHost(state, maxConcurrent, minIntervalMs)
      return
    }
    state.active++
    state.nextStartAt = this.now() + minIntervalMs
    let released = false
    item.resolve(() => {
      if (released) return
      released = true
      state.active = Math.max(0, state.active - 1)
      this.drainHost(state, maxConcurrent, minIntervalMs)
    })
    this.drainHost(state, maxConcurrent, minIntervalMs)
  }
}

function headersRecord(headers: RequestInit["headers"] | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries())
}

function cacheKeyFor(method: string, url: string, headers: Record<string, string>): string {
  const headerKey = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key.toLowerCase()}:${createHash("sha256").update(value).digest("hex")}`)
    .join("|")
  return `${method} ${url} ${headerKey}`
}

function safeEndpoint(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return "remote provider"
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599)
}

export function retryAfterMs(value: string | null | undefined, attempt: number, now = Date.now): number {
  if (value) {
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 60_000)
    const date = Date.parse(value)
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - now()), 60_000)
  }
  return Math.min(1_000 * 2 ** attempt, 15_000)
}

function abortError(url: string, cause?: unknown): HttpRequestError {
  return new HttpRequestError(`Request aborted for ${safeEndpoint(url)}`, {
    kind: "abort",
    retryable: false,
    cause,
  })
}

function combineSignals(timeout: AbortSignal, caller?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  if (!caller) return { signal: timeout, cleanup: () => {} }
  const controller = new AbortController()
  const forwardTimeout = () => controller.abort(timeout.reason)
  const forwardCaller = () => controller.abort(caller.reason)
  timeout.addEventListener("abort", forwardTimeout, { once: true })
  caller.addEventListener("abort", forwardCaller, { once: true })
  if (timeout.aborted) forwardTimeout()
  if (caller.aborted) forwardCaller()
  return {
    signal: controller.signal,
    cleanup: () => {
      timeout.removeEventListener("abort", forwardTimeout)
      caller.removeEventListener("abort", forwardCaller)
    },
  }
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError("retry delay", signal.reason))
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError("retry delay", signal?.reason))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export function sanitizedError(error: unknown): { type: string; message: string; status?: number; retryable: boolean } {
  if (error instanceof HttpRequestError) {
    return {
      type: error.kind,
      message: error.message,
      status: error.status,
      retryable: error.retryable,
    }
  }
  return {
    type: "provider_error",
    message: error instanceof Error ? sanitizeMessage(error.message) : "Unknown provider error",
    retryable: false,
  }
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s?#]+(?:\?[^\s]*)?/gi, (match) => safeEndpoint(match))
    .replace(/\b(?:api[_-]?key|token|authorization|secret)=\S+/gi, "$1=[redacted]")
    .slice(0, 300)
}
