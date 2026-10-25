import "server-only";
import { all, get, run, tx, logActivity } from "./db";
import { sha256 } from "./auth";
import { redact } from "./redact";
import type { Doc, Entry, EntryType, EntryWithTopic, IncomingDoc, Question, Source, SourceType, Topic } from "./types";

/* ---------- sources ---------- */

export function listSources(): (Source & { doc_count: number; pending_count: number })[] {
  return all(
    `SELECT s.*, count(d.id) doc_count, sum(CASE WHEN d.processed_at IS NULL THEN 1 ELSE 0 END) pending_count
     FROM sources s LEFT JOIN documents d ON d.source_id = s.id
     GROUP BY s.id ORDER BY s.created_at`,
  );
}

export function getSource(id: number) {
  return get<Source>("SELECT * FROM sources WHERE id = ?", id);
}

/** One source row per connector type + name; created on first use. */
export function ensureSource(type: SourceType, name: string, config: object = {}): Source {
  const existing = get<Source>("SELECT * FROM sources WHERE type = ? AND name = ?", type, name);
  if (existing) return existing;
  const { id } = run("INSERT INTO sources (type, name, config) VALUES (?, ?, ?)", type, name, JSON.stringify(config));
  return getSource(id)!;
}

export function setSourceStatus(id: number, status: string, error: string | null = null) {
  run(
    `UPDATE sources SET status = ?, last_error = ?, last_synced_at = CASE WHEN ? = 'idle' THEN datetime('now') ELSE last_synced_at END WHERE id = ?`,
    status,
    error,
    status,
    id,
  );
}

export function deleteSource(id: number) {
  run("DELETE FROM sources WHERE id = ?", id);
}

/* ---------- documents ---------- */

export type IngestResult = { added: number; updated: number; skipped: number; redactions: number };

/**
 * Upserts documents for a source. Unchanged content is skipped; changed content is
 * re-queued for extraction. Secrets are stripped before storage.
 */
export function ingestDocuments(sourceId: number, docs: IncomingDoc[]): IngestResult {
  const result: IngestResult = { added: 0, updated: 0, skipped: 0, redactions: 0 };
  tx(() => {
    for (const d of docs) {
      const content = d.content.trim();
      if (content.length < 20) {
        result.skipped++;
        continue;
      }
      const clean = redact(content);
      result.redactions += clean.count;
      const hash = sha256(clean.text);
      const prev = get<{ id: number; content_hash: string }>(
        "SELECT id, content_hash FROM documents WHERE source_id = ? AND external_id = ?",
        sourceId,
        d.externalId,
      );
      if (prev?.content_hash === hash) {
        result.skipped++;
        continue;
      }
      if (prev) {
        run(
          `UPDATE documents SET title = ?, author = ?, channel = ?, url = ?, content = ?, content_hash = ?,
             occurred_at = ?, processed_at = NULL, process_error = NULL WHERE id = ?`,
          d.title.slice(0, 300),
          d.author ?? null,
          d.channel ?? null,
          d.url ?? null,
          clean.text,
          hash,
          d.occurredAt ?? null,
          prev.id,
        );
        result.updated++;
      } else {
        run(
          `INSERT INTO documents (source_id, external_id, kind, title, author, channel, url, content, content_hash, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          sourceId,
          d.externalId,
          d.kind,
          d.title.slice(0, 300),
          d.author ?? null,
          d.channel ?? null,
          d.url ?? null,
          clean.text,
          hash,
          d.occurredAt ?? null,
        );
        result.added++;
      }
    }
  });
  return result;
}

export function getDocument(id: number) {
  return get<Doc & { source_name: string; source_type: SourceType }>(
    `SELECT d.*, s.name source_name, s.type source_type FROM documents d JOIN sources s ON s.id = d.source_id WHERE d.id = ?`,
    id,
  );
}

export function pendingDocuments(limit: number): Doc[] {
  return all<Doc>(
    "SELECT * FROM documents WHERE processed_at IS NULL ORDER BY occurred_at IS NULL, occurred_at, id LIMIT ?",
    limit,
  );
}

export function markProcessed(ids: number[], error: string | null = null) {
  for (const id of ids) {
    run("UPDATE documents SET processed_at = datetime('now'), process_error = ? WHERE id = ?", error, id);
  }
}

export function listDocuments(opts: { sourceId?: number; limit?: number } = {}) {
  return all<Doc & { source_name: string; source_type: SourceType; entry_count: number }>(
    `SELECT d.id, d.source_id, d.external_id, d.kind, d.title, d.author, d.channel, d.url,
            substr(d.content, 1, 400) content, d.occurred_at, d.ingested_at, d.processed_at, d.process_error,
            s.name source_name, s.type source_type,
            (SELECT count(*) FROM entry_sources es WHERE es.document_id = d.id) entry_count
     FROM documents d JOIN sources s ON s.id = d.source_id
     WHERE (? IS NULL OR d.source_id = ?)
     ORDER BY coalesce(d.occurred_at, d.ingested_at) DESC LIMIT ?`,
    opts.sourceId ?? null,
    opts.sourceId ?? null,
    opts.limit ?? 200,
  );
}

/* ---------- topics ---------- */

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "general";

export function listTopics(): (Topic & { entry_count: number; approved_count: number; pending_count: number })[] {
  return all(
    `SELECT t.*, count(e.id) entry_count,
            sum(CASE WHEN e.status = 'approved' THEN 1 ELSE 0 END) approved_count,
            sum(CASE WHEN e.status = 'pending' THEN 1 ELSE 0 END) pending_count
     FROM topics t LEFT JOIN entries e ON e.topic_id = t.id AND e.status IN ('approved','pending')
     GROUP BY t.id ORDER BY t.position, t.name`,
  );
}

export function getTopicBySlug(slug: string) {
  return get<Topic>("SELECT * FROM topics WHERE slug = ?", slug);
}

export function ensureTopic(name: string, description = ""): Topic {
  const clean = name.trim().slice(0, 80) || "General";
  const slug = slugify(clean);
  const existing = get<Topic>("SELECT * FROM topics WHERE slug = ?", slug);
  if (existing) return existing;
  const { id } = run("INSERT INTO topics (slug, name, description) VALUES (?, ?, ?)", slug, clean, description);
  return get<Topic>("SELECT * FROM topics WHERE id = ?", id)!;
}

export function updateTopicSummary(id: number, summary: string) {
  run("UPDATE topics SET summary = ?, summary_updated_at = datetime('now') WHERE id = ?", summary, id);
}

/* ---------- entries ---------- */

const ENTRY_SELECT = `
  SELECT e.*, t.name topic_name, t.slug topic_slug,
         (SELECT count(*) FROM entry_sources es WHERE es.entry_id = e.id) source_count
  FROM entries e LEFT JOIN topics t ON t.id = e.topic_id`;

export function listEntries(
  filter: { status?: string; topicId?: number; type?: string; limit?: number } = {},
): EntryWithTopic[] {
  return all<EntryWithTopic>(
    `${ENTRY_SELECT}
     WHERE (? IS NULL OR e.status = ?) AND (? IS NULL OR e.topic_id = ?) AND (? IS NULL OR e.type = ?)
     ORDER BY e.updated_at DESC LIMIT ?`,
    filter.status ?? null,
    filter.status ?? null,
    filter.topicId ?? null,
    filter.topicId ?? null,
    filter.type ?? null,
    filter.type ?? null,
    filter.limit ?? 500,
  );
}

export function getEntry(id: number) {
  return get<EntryWithTopic>(`${ENTRY_SELECT} WHERE e.id = ?`, id);
}

export function entryEvidence(entryId: number) {
  return all<{ document_id: number; quote: string | null; title: string; kind: string; author: string | null; channel: string | null; occurred_at: string | null; url: string | null; source_type: SourceType }>(
    `SELECT es.document_id, es.quote, d.title, d.kind, d.author, d.channel, d.occurred_at, d.url, s.type source_type
     FROM entry_sources es JOIN documents d ON d.id = es.document_id JOIN sources s ON s.id = d.source_id
     WHERE es.entry_id = ? ORDER BY d.occurred_at DESC`,
    entryId,
  );
}

export type NewEntry = {
  topicId: number | null;
  type: EntryType;
  title: string;
  body: string;
  confidence: number;
  status?: Entry["status"];
  origin?: Entry["origin"];
  owner?: string | null;
  tags?: string[];
};

export function createEntry(e: NewEntry): number {
  return run(
    `INSERT INTO entries (topic_id, type, title, body, confidence, status, origin, owner, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.topicId,
    e.type,
    e.title.slice(0, 200),
    e.body,
    clamp(e.confidence),
    e.status ?? "pending",
    e.origin ?? "ai",
    e.owner ?? null,
    JSON.stringify(e.tags ?? []),
  ).id;
}

export function updateEntry(
  id: number,
  patch: Partial<Pick<Entry, "title" | "body" | "type" | "topic_id" | "owner" | "status" | "confidence">>,
) {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(k === "confidence" ? clamp(v as number) : (v as string | number | null));
  }
  if (!sets.length) return;
  run(`UPDATE entries SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`, ...vals, id);
}

export function reviewEntry(id: number, status: "approved" | "rejected" | "stale", userId: number) {
  run(
    "UPDATE entries SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    status,
    userId,
    id,
  );
}

export function deleteEntry(id: number) {
  run("DELETE FROM entries WHERE id = ?", id);
}

export function addEvidence(entryId: number, documentId: number, quote: string | null) {
  run(
    "INSERT INTO entry_sources (entry_id, document_id, quote) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET quote = coalesce(excluded.quote, quote)",
    entryId,
    documentId,
    quote ? quote.slice(0, 600) : null,
  );
}

export function createConflict(a: number, b: number, explanation: string) {
  const dupe = get(
    "SELECT id FROM conflicts WHERE status = 'open' AND ((entry_a = ? AND entry_b = ?) OR (entry_a = ? AND entry_b = ?))",
    a,
    b,
    b,
    a,
  );
  if (!dupe) run("INSERT INTO conflicts (entry_a, entry_b, explanation) VALUES (?, ?, ?)", a, b, explanation);
}

export function openConflicts() {
  return all<{ id: number; entry_a: number; entry_b: number; explanation: string; created_at: string }>(
    "SELECT * FROM conflicts WHERE status = 'open' ORDER BY created_at DESC",
  );
}

export function resolveConflict(id: number, status: "resolved" | "dismissed") {
  run("UPDATE conflicts SET status = ? WHERE id = ?", status, id);
}

/* ---------- questions (staff interviews + knowledge gaps) ---------- */

export function listQuestions(status: Question["status"] | "all" = "open"): (Question & { topic_name: string | null })[] {
  return all(
    `SELECT q.*, t.name topic_name FROM questions q LEFT JOIN topics t ON t.id = q.topic_id
     WHERE (? = 'all' OR q.status = ?) ORDER BY q.times_asked DESC, q.created_at DESC`,
    status,
    status,
  );
}

/** Adds a question, or bumps `times_asked` when a near-identical one is already open. */
export function upsertQuestion(q: {
  question: string;
  context?: string | null;
  topicId?: number | null;
  assignee?: string | null;
  origin: Question["origin"];
}): number {
  const normalized = q.question.trim().replace(/\s+/g, " ");
  const existing = get<{ id: number }>(
    "SELECT id FROM questions WHERE status = 'open' AND lower(question) = lower(?)",
    normalized,
  );
  if (existing) {
    run("UPDATE questions SET times_asked = times_asked + 1 WHERE id = ?", existing.id);
    return existing.id;
  }
  return run(
    "INSERT INTO questions (question, context, topic_id, assignee, origin) VALUES (?, ?, ?, ?, ?)",
    normalized.slice(0, 500),
    q.context ?? null,
    q.topicId ?? null,
    q.assignee ?? null,
    q.origin,
  ).id;
}

export function getQuestion(id: number) {
  return get<Question>("SELECT * FROM questions WHERE id = ?", id);
}

export function answerQuestion(id: number, answer: string, by: string) {
  run(
    "UPDATE questions SET status = 'answered', answer = ?, answered_by = ?, answered_at = datetime('now') WHERE id = ?",
    answer,
    by,
    id,
  );
}

export function dismissQuestion(id: number) {
  run("UPDATE questions SET status = 'dismissed' WHERE id = ?", id);
}

/* ---------- stats ---------- */

export function stats() {
  const n = (sql: string) => get<{ n: number }>(sql)?.n ?? 0;
  return {
    documents: n("SELECT count(*) n FROM documents"),
    unprocessed: n("SELECT count(*) n FROM documents WHERE processed_at IS NULL"),
    approved: n("SELECT count(*) n FROM entries WHERE status = 'approved'"),
    pending: n("SELECT count(*) n FROM entries WHERE status = 'pending'"),
    conflicts: n("SELECT count(*) n FROM conflicts WHERE status = 'open'"),
    openQuestions: n("SELECT count(*) n FROM questions WHERE status = 'open'"),
    agentQueries7d: n("SELECT count(*) n FROM query_log WHERE channel != 'ui' AND created_at > datetime('now','-7 days')"),
    unanswered7d: n("SELECT count(*) n FROM query_log WHERE answered = 0 AND created_at > datetime('now','-7 days')"),
    topics: n("SELECT count(*) n FROM topics"),
  };
}

export function recentActivity(limit = 12) {
  return all<{ id: number; actor: string; action: string; detail: string | null; created_at: string }>(
    "SELECT * FROM activity ORDER BY id DESC LIMIT ?",
    limit,
  );
}

export function recentQueries(limit = 30) {
  return all<{ id: number; channel: string; kind: string; query: string; result_count: number; answered: number; latency_ms: number | null; created_at: string; key_name: string | null }>(
    `SELECT q.*, k.name key_name FROM query_log q LEFT JOIN api_keys k ON k.id = q.api_key_id ORDER BY q.id DESC LIMIT ?`,
    limit,
  );
}

export function logQuery(q: {
  channel: "ui" | "api" | "mcp";
  apiKeyId?: number | null;
  kind: string;
  query: string;
  resultCount: number;
  answered: boolean;
  latencyMs: number;
}) {
  run(
    "INSERT INTO query_log (channel, api_key_id, kind, query, result_count, answered, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
    q.channel,
    q.apiKeyId ?? null,
    q.kind,
    q.query.slice(0, 1000),
    q.resultCount,
    q.answered ? 1 : 0,
    q.latencyMs,
  );
}

export { logActivity };

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
