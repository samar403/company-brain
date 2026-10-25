import "server-only";
import { all, ftsQuery } from "./db";
import type { EntryWithTopic, SourceType } from "./types";

export type EntryHit = EntryWithTopic & { score: number; snippet: string };
export type DocHit = {
  id: number;
  title: string;
  kind: string;
  author: string | null;
  channel: string | null;
  occurred_at: string | null;
  source_type: SourceType;
  score: number;
  snippet: string;
};

/**
 * Lexical retrieval with SQLite FTS5 (BM25, porter stemming). Titles weigh 4x the
 * body. Approved entries rank ahead of pending ones of similar relevance, and
 * confidence nudges the order. Good enough for tens of thousands of entries; plug
 * in a vector index behind this function when you outgrow it.
 */
export function searchEntries(
  text: string,
  opts: { limit?: number; includePending?: boolean; topicSlug?: string; type?: string } = {},
): EntryHit[] {
  const q = ftsQuery(text);
  if (!q) return [];
  const statuses = opts.includePending ? ["approved", "pending"] : ["approved"];
  return all<EntryHit>(
    `SELECT e.*, t.name topic_name, t.slug topic_slug,
            (SELECT count(*) FROM entry_sources es WHERE es.entry_id = e.id) source_count,
            bm25(entries_fts, 4.0, 1.0) * (CASE e.status WHEN 'approved' THEN 1.0 ELSE 0.75 END) * (0.6 + 0.4 * e.confidence) score,
            snippet(entries_fts, 1, '«', '»', ' … ', 18) snippet
     FROM entries_fts JOIN entries e ON e.id = entries_fts.rowid
     LEFT JOIN topics t ON t.id = e.topic_id
     WHERE entries_fts MATCH ?
       AND e.status IN (${statuses.map(() => "?").join(",")})
       AND (? IS NULL OR t.slug = ?)
       AND (? IS NULL OR e.type = ?)
     ORDER BY score LIMIT ?`,
    q,
    ...statuses,
    opts.topicSlug ?? null,
    opts.topicSlug ?? null,
    opts.type ?? null,
    opts.type ?? null,
    opts.limit ?? 10,
  );
}

export function searchDocuments(text: string, limit = 6): DocHit[] {
  const q = ftsQuery(text);
  if (!q) return [];
  return all<DocHit>(
    `SELECT d.id, d.title, d.kind, d.author, d.channel, d.occurred_at, s.type source_type,
            bm25(documents_fts, 3.0, 1.0) score,
            snippet(documents_fts, 1, '«', '»', ' … ', 24) snippet
     FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid
     JOIN sources s ON s.id = d.source_id
     WHERE documents_fts MATCH ? ORDER BY score LIMIT ?`,
    q,
    limit,
  );
}

/** Entries that look like the same piece of knowledge as `title + body`. */
export function similarEntries(title: string, body: string, limit = 5): EntryHit[] {
  return searchEntries(`${title} ${title} ${body.slice(0, 300)}`, { includePending: true, limit });
}
