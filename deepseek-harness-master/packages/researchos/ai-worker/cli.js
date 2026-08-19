#!/usr/bin/env node
// Standalone CLI for the research-ai-worker — lets the pipeline be verified
// against the real MySQL/PG/gateway WITHOUT restarting dsh.
//
// Usage (env from repo .env is loaded automatically by lib/config):
//   node cli.js analyze  <paperId>
//   node cli.js cleanup  <paperId>
//   node cli.js review   <taskId> --papers 49,50,51 --topic "Acoustic classification"
//   node cli.js health
// @module @researchos/dsh-research-ai-worker/cli

import { analyzePaper, cleanupPaper } from './lib/analyze.js'
import { generateReview } from './lib/review.js'
import { GATEWAY, LLM_MODEL, EMBED_MODEL, CHUNK_SIZE, CHUNK_OVERLAP } from './lib/config.js'

function usage() {
  console.log(`research-ai-worker CLI
  node cli.js analyze <paperId>            run the paper analysis pipeline (parse->chunk->embed->PG->card->READY)
  node cli.js cleanup <paperId>            delete paper_chunk rows for a paper
  node cli.js review <taskId> --papers 1,2 --topic "..."   generate a literature review into ai_task
  node cli.js health                       print config summary`)
}

async function main(argv) {
  const [cmd, ...rest] = argv
  switch (cmd) {
    case 'analyze': {
      const id = Number(rest[0])
      if (!Number.isInteger(id) || id <= 0) return usage()
      const r = await analyzePaper(id)
      console.log(JSON.stringify(r, null, 2))
      break
    }
    case 'cleanup': {
      const id = Number(rest[0])
      if (!Number.isInteger(id) || id <= 0) return usage()
      const r = await cleanupPaper(id)
      console.log(JSON.stringify(r, null, 2))
      break
    }
    case 'review': {
      const taskId = Number(rest[0])
      const papers = rest.find((a) => a.startsWith('--papers'))?.split('=')[1] || rest[rest.indexOf('--papers') + 1]
      const topic = rest.find((a) => a.startsWith('--topic'))?.split('=')[1] || rest[rest.indexOf('--topic') + 1]
      if (!Number.isInteger(taskId) || !papers) return usage()
      const paperIds = papers.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
      const r = await generateReview(taskId, paperIds, topic || '')
      console.log(JSON.stringify(r, null, 2))
      break
    }
    case 'health':
      console.log(
        JSON.stringify({ gateway: GATEWAY, llmModel: LLM_MODEL, embedModel: EMBED_MODEL, chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP }, null, 2),
      )
      break
    default:
      usage()
  }
}

main(process.argv.slice(2)).then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
