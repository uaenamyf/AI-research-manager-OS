// pgvector paper_chunk store: insert / cosine search (multi-paper) / delete.
// Port of ai-service/app/rag/vector_store.py — chunk schema and SQL semantics
// are kept identical so the same PG table serves both the legacy ai-service
// pipeline and this worker.
// @module @researchos/dsh-research-ai-worker/lib/vector

export function createVectorStore(pool) {
  const vec = (emb) => `[${emb.join(',')}]`

  return {
    /** chunks: [{section, content, embedding}] -> inserted count */
    async insertChunks(paperId, chunks) {
      if (!chunks.length) return 0
      const client = await pool.connect()
      try {
        for (const c of chunks) {
          await client.query(
            'INSERT INTO paper_chunk (paper_id, section, content, embedding) VALUES ($1, $2, $3, $4::vector)',
            [paperId, c.section, c.content, vec(c.embedding)],
          )
        }
        return chunks.length
      } finally {
        client.release()
      }
    },

    /** cross-paper cosine search (review RAG), mirror search_multi. */
    async searchMulti(paperIds, queryEmbedding, topK = 24) {
      if (!paperIds.length) return []
      const { rows } = await pool.query(
        `SELECT id, paper_id, section, content,
                1 - (embedding <=> $1::vector) AS score
         FROM paper_chunk
         WHERE paper_id = ANY($2::bigint[])
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [vec(queryEmbedding), paperIds, topK],
      )
      return rows.map((r) => ({
        id: Number(r.id),
        paper_id: Number(r.paper_id),
        section: r.section,
        content: r.content,
        score: Number(r.score),
      }))
    },

    /** delete all chunks of a paper (paper delete cleanup). */
    async deleteByPaper(paperId) {
      const { rowCount } = await pool.query('DELETE FROM paper_chunk WHERE paper_id = $1', [paperId])
      return rowCount || 0
    },
  }
}
