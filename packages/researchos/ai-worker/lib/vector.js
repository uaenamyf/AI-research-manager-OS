// paper_chunk store over the embedded SQLite db (researchos lib/db.js):
// insert / cosine search (multi-paper) / delete. Embeddings are Float32Array
// BLOBs; cosine search runs in JS (thousands of chunks -> ms-scale scans).
// Interface kept identical to the previous pgvector store so callers
// (analyze.js / review.js / cli.js) stay untouched.
// @module @researchos/dsh-research-ai-worker/lib/vector

import { insertChunks as dbInsertChunks, searchChunks, deleteChunksByPaper } from '../../lib/db.js'

export function createVectorStore() {
  return {
    /** chunks: [{section, content, embedding}] -> inserted count */
    async insertChunks(paperId, chunks) {
      if (!chunks.length) return 0
      return dbInsertChunks(paperId, chunks)
    },

    /** cross-paper cosine search (review RAG), mirror search_multi. */
    async searchMulti(paperIds, queryEmbedding, topK = 24) {
      if (!paperIds.length) return []
      return searchChunks(queryEmbedding, { paperIds, limit: topK })
    },

    /** delete all chunks of a paper (paper delete cleanup). */
    async deleteByPaper(paperId) {
      return deleteChunksByPaper(paperId)
    },
  }
}
