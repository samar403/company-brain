import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * Single embedded SQLite database (Node's built-in `node:sqlite`, FTS5 enabled).
 * One file per deployment keeps setup to zero; swap for Postgres by
 * re-implementing the small repository layer in `store.ts`.
 */

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "brain.db");

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin','editor','viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('slack','email','staff','upload','webhook')),
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'idle',
  last_synced_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  channel TEXT,
  url TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  occurred_at TEXT,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  process_error TEXT,
  UNIQUE (source_id, external_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title, content, content='documents', content_rowid='id', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE OF title, content ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  summary_updated_at TEXT,
  position INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('fact','process','policy','decision','faq','contact','glossary')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.7,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','stale')),
  origin TEXT NOT NULL DEFAULT 'ai' CHECK (origin IN ('ai','human')),
  owner TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS entries_topic ON entries(topic_id);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  title, body, content='entries', content_rowid='id', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE OF title, body ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO entries_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TABLE IF NOT EXISTS entry_sources (
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  quote TEXT,
  PRIMARY KEY (entry_id, document_id)
);

CREATE TABLE IF NOT EXISTS conflicts (
  id INTEGER PRIMARY KEY,
  entry_a INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  entry_b INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL,
  context TEXT,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  assignee TEXT,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('gap','ai','manual','agent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','dismissed')),
  answer TEXT,
  answered_by TEXT,
  answered_at TEXT,
  times_asked INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT '["read"]',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS query_log (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('ui','api','mcp')),
  api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  query TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  answered INTEGER NOT NULL DEFAULT 1,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

declare global {
  var __brainDb: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA);
  return db;
}

export function db(): DatabaseSync {
  // Reuse across hot reloads and route handlers in the same process.
  globalThis.__brainDb ??= open();
  return globalThis.__brainDb;
}

type Param = string | number | bigint | null | Uint8Array;

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Param[]) {
  const r = db().prepare(sql).run(...params);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function getSetting(key: string, fallback = ""): string {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

export function logActivity(actor: string, action: string, detail?: string) {
  run("INSERT INTO activity (actor, action, detail) VALUES (?, ?, ?)", actor, action, detail ?? null);
}

/** Turn free text into a safe FTS5 MATCH expression (OR of quoted terms). */
export function ftsQuery(text: string): string | null {
  const terms = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .slice(0, 16);
  if (!terms.length) return null;
  return [...new Set(terms)].map((t) => `"${t}"*`).join(" OR ");
}

const STOPWORDS = new Set(
  "a an and are as at be by do does for from has have how i in is it its of on or our should that the their them there they this to was we what when where which who why will with you your can my me us about into".split(
    " ",
  ),
);
