import type Database from "better-sqlite3";

type ChunkRow = {
  chunk_text: string;
  doc_type: string;
  field_tags: string;
  chunk_index: number;
};

/**
 * Retrieves the most relevant chunks for a given query from the embedding_chunks table.
 * Uses simple keyword overlap (BM25-style) since embeddings are not yet computed.
 * Returns a formatted string block ready to inject into the LLM prompt.
 */
export function retrieveRelevantChunks(
  shipmentId: string,
  query: string,
  db: Database.Database,
  topK = 5
): string {
  const rows = db
    .prepare(
      `SELECT chunk_text, doc_type, field_tags, chunk_index
       FROM embedding_chunks
       WHERE shipment_id = ?
       ORDER BY created_at DESC`
    )
    .all(shipmentId) as ChunkRow[];

  if (rows.length === 0) return "";

  const queryTerms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);

  const scored = rows.map((row) => {
    const text = row.chunk_text.toLowerCase();
    const tags = (JSON.parse(row.field_tags) as string[]).join(" ").toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) score += 2;
      if (tags.includes(term)) score += 1;
    }
    return { ...row, score };
  });

  const top = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (top.length === 0) {
    // Return a sample of chunks if nothing matched the query
    return rows
      .slice(0, topK)
      .map((r) => `[${r.doc_type}] ${r.chunk_text}`)
      .join("\n");
  }

  return top.map((r) => `[${r.doc_type}] ${r.chunk_text}`).join("\n");
}
