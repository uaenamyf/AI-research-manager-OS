import { appendFile, mkdir, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { SearchResponse } from "./types.js"

export function defaultHistoryPath(env: NodeJS.ProcessEnv = process.env): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state")
  return join(stateHome, "literature-search-mcp", "history.jsonl")
}

export interface HistoryStoreOptions {
  path?: string
  log?: (message: string) => void
}

export class HistoryStore {
  readonly path: string
  private readonly log: (message: string) => void

  constructor(options: HistoryStoreOptions = {}) {
    this.path = options.path ?? defaultHistoryPath()
    this.log = options.log ?? ((message) => console.error(message))
  }

  async append(response: SearchResponse): Promise<void> {
    const record = {
      timestamp: new Date().toISOString(),
      query: response.query,
      parameters: response.parameters,
      source_statuses: response.source_statuses,
      results: response.results.map((result) => ({
        rank: result.rank,
        identifiers: result.identifiers,
        url: result.url,
        pdf_url: result.pdf_url,
        source_evidence: result.source_evidence,
      })),
    }
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await appendFile(this.path, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 })
    } catch (error) {
      this.log(`literature-search-mcp: unable to write history: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true })
  }
}
