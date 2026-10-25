export const ENTRY_TYPES = ["fact", "process", "policy", "decision", "faq", "contact", "glossary"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  fact: "Fact",
  process: "How-to",
  policy: "Policy",
  decision: "Decision",
  faq: "FAQ",
  contact: "Who owns it",
  glossary: "Glossary",
};

export type EntryStatus = "pending" | "approved" | "rejected" | "stale";
export type SourceType = "slack" | "email" | "staff" | "upload" | "webhook";

export type Source = {
  id: number;
  type: SourceType;
  name: string;
  config: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type Doc = {
  id: number;
  source_id: number;
  external_id: string;
  kind: string;
  title: string;
  author: string | null;
  channel: string | null;
  url: string | null;
  content: string;
  occurred_at: string | null;
  ingested_at: string;
  processed_at: string | null;
  process_error: string | null;
};

export type Topic = {
  id: number;
  slug: string;
  name: string;
  description: string;
  summary: string;
  summary_updated_at: string | null;
  position: number;
};

export type Entry = {
  id: number;
  topic_id: number | null;
  type: EntryType;
  title: string;
  body: string;
  confidence: number;
  status: EntryStatus;
  origin: "ai" | "human";
  owner: string | null;
  tags: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export type EntryWithTopic = Entry & { topic_name: string | null; topic_slug: string | null; source_count: number };

export type Question = {
  id: number;
  question: string;
  context: string | null;
  topic_id: number | null;
  assignee: string | null;
  origin: "gap" | "ai" | "manual" | "agent";
  status: "open" | "answered" | "dismissed";
  answer: string | null;
  answered_by: string | null;
  answered_at: string | null;
  times_asked: number;
  created_at: string;
};

/** A document as connectors hand it to the ingest step. */
export type IncomingDoc = {
  externalId: string;
  kind: "slack_thread" | "email_thread" | "qa" | "note" | "file";
  title: string;
  author?: string;
  channel?: string;
  url?: string;
  content: string;
  occurredAt?: string;
};
