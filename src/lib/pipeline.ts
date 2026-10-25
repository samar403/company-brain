import "server-only";
import { aiEnabled, generateJson } from "./ai/claude";
import {
  ANSWER_SCHEMA,
  ANSWER_SYSTEM,
  EXTRACT_SCHEMA,
  EXTRACT_SYSTEM,
  GUIDE_SCHEMA,
  GUIDE_SYSTEM,
  INTERVIEW_SCHEMA,
  INTERVIEW_SYSTEM,
  type AnswerResult,
  type ExtractResult,
} from "./ai/prompts";
import { heuristicAnswer, heuristicExtract, heuristicTopicSummary } from "./ai/heuristics";
import { all, get, getSetting, logActivity, run } from "./db";
import { searchDocuments, searchEntries, similarEntries, type DocHit, type EntryHit } from "./search";
import {
  addEvidence,
  createConflict,
  createEntry,
  ensureTopic,
  getEntry,
  listTopics,
  logQuery,
  markProcessed,
  pendingDocuments,
  updateEntry,
  updateTopicSummary,
  upsertQuestion,
} from "./store";
import type { Doc, Entry } from "./types";

const BATCH_CHARS = 40_000;
const MAX_DOC_CHARS = 16_000;

export type ProcessReport = {
  documents: number;
  created: number;
  updated: number;
  confirmed: number;
  conflicts: number;
  questions: number;
  errors: string[];
  mode: "claude" | "offline";
};

function batches(docs: Doc[]): Doc[][] {
  const out: Doc[][] = [];
  let cur: Doc[] = [];
  let size = 0;
  for (const d of docs) {
    const len = Math.min(d.content.length, MAX_DOC_CHARS);
    if (cur.length && size + len > BATCH_CHARS) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(d);
    size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

function renderDoc(d: Doc): string {
  const meta = [d.kind, d.channel && `channel: ${d.channel}`, d.author && `author: ${d.author}`, d.occurred_at && `date: ${d.occurred_at}`]
    .filter(Boolean)
    .join(" | ");
  const body = d.content.length > MAX_DOC_CHARS ? `${d.content.slice(0, MAX_DOC_CHARS)}\n[truncated]` : d.content;
  return `<document id="${d.id}" title="${escapeAttr(d.title)}" meta="${escapeAttr(meta)}">\n${body}\n</document>`;
}

function renderEntry(e: Pick<Entry, "id" | "type" | "title" | "body" | "status" | "confidence"> & { topic_name?: string | null }) {
  return `<entry id="${e.id}" type="${e.type}" status="${e.status}" topic="${escapeAttr(e.topic_name ?? "")}" confidence="${e.confidence.toFixed(2)}">\n# ${e.title}\n${e.body}\n</entry>`;
}

const escapeAttr = (s: string) => s.replace(/"/g, "'").replace(/[\r\n]+/g, " ");

/** Extracts knowledge from every unprocessed document. Safe to call repeatedly. */
export async function processPending(opts: { limit?: number; actor?: string } = {}): Promise<ProcessReport> {
  const docs = pendingDocuments(opts.limit ?? 60);
  const report: ProcessReport = {
    documents: 0,
    created: 0,
    updated: 0,
    confirmed: 0,
    conflicts: 0,
    questions: 0,
    errors: [],
    mode: aiEnabled() ? "claude" : "offline",
  };

  for (const batch of batches(docs)) {
    const ids = batch.map((d) => d.id);
    try {
      const result = await extractBatch(batch);
      applyExtraction(result, batch, report);
      markProcessed(ids);
      report.documents += batch.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(msg);
      markProcessed(ids, msg.slice(0, 500));
    }
  }

  if (report.documents) {
    logActivity(
      opts.actor ?? "pipeline",
      "processed documents",
      `${report.documents} document${report.documents === 1 ? "" : "s"} → ${report.created} new, ${report.updated} updated, ${report.confirmed} confirmed, ${report.conflicts} conflicts (${report.mode})`,
    );
  }
  return report;
}

async function extractBatch(batch: Doc[]): Promise<ExtractResult> {
  if (!aiEnabled()) return heuristicExtract(batch);

  // Pull the existing entries most related to this batch so Claude can merge
  // instead of duplicating.
  const related = new Map<number, EntryHit>();
  for (const d of batch) {
    for (const hit of searchEntries(`${d.title} ${d.content.slice(0, 1500)}`, { includePending: true, limit: 6 })) {
      related.set(hit.id, hit);
    }
  }
  const topics = listTopics().map((t) => t.name);
  const company = getSetting("company_name", "the company");

  const prompt = [
    `Company: ${company}`,
    `Existing topics: ${topics.length ? topics.join(", ") : "(none yet)"}`,
    `<existing_entries>\n${[...related.values()].slice(0, 30).map(renderEntry).join("\n") || "(none)"}\n</existing_entries>`,
    `<documents>\n${batch.map(renderDoc).join("\n")}\n</documents>`,
    "Extract the knowledge from these documents.",
  ].join("\n\n");

  return generateJson<ExtractResult>({ system: EXTRACT_SYSTEM, prompt, schema: EXTRACT_SCHEMA, effort: "medium" });
}

function applyExtraction(result: ExtractResult, batch: Doc[], report: ProcessReport) {
  const docIds = new Set(batch.map((d) => d.id));
  const humanDocs = new Set(batch.filter((d) => d.kind === "qa").map((d) => d.id));
  const autoApprove = Number(getSetting("auto_approve_threshold", "1.1"));

  for (const item of result.items) {
    const evidence = item.evidence.filter((ev) => docIds.has(ev.document_id));
    if (!evidence.length) evidence.push({ document_id: batch[0].id, quote: "" });
    const fromStaff = evidence.every((ev) => humanDocs.has(ev.document_id));
    const topic = ensureTopic(item.topic || "General");
    const target = item.target_entry_id ? getEntry(item.target_entry_id) : undefined;

    let action = item.action;
    // Heuristic mode never proposes merges; catch obvious duplicates by title.
    if (action === "create") {
      const dupe = similarEntries(item.title, item.body, 1)[0];
      if (dupe && dupe.title.toLowerCase() === item.title.toLowerCase()) {
        action = "confirm";
        item.target_entry_id = dupe.id;
      }
    }
    const existing = target ?? (item.target_entry_id ? getEntry(item.target_entry_id) : undefined);
    if (action !== "create" && !existing) action = "create";

    const attach = (entryId: number) => evidence.forEach((ev) => addEvidence(entryId, ev.document_id, ev.quote || null));

    switch (action) {
      case "create": {
        const status =
          fromStaff || item.confidence >= autoApprove ? "approved" : "pending";
        const id = createEntry({
          topicId: topic.id,
          type: item.type,
          title: item.title,
          body: item.body,
          confidence: fromStaff ? Math.max(item.confidence, 0.9) : item.confidence,
          status,
          origin: fromStaff ? "human" : "ai",
          owner: item.owner || null,
          tags: item.tags,
        });
        attach(id);
        report.created++;
        break;
      }
      case "update": {
        // Human-curated entries are never silently rewritten: raise a conflict instead.
        if (existing!.origin === "human" && existing!.status === "approved" && !fromStaff) {
          const id = createEntry({
            topicId: topic.id,
            type: item.type,
            title: item.title,
            body: item.body,
            confidence: item.confidence,
            owner: item.owner || null,
            tags: item.tags,
          });
          attach(id);
          createConflict(existing!.id, id, `Newer sources suggest a change to a human-approved entry: ${item.conflict_note || "review the proposed update."}`);
          report.conflicts++;
          break;
        }
        updateEntry(existing!.id, {
          title: item.title,
          body: item.body,
          type: item.type,
          topic_id: topic.id,
          owner: item.owner || existing!.owner,
          confidence: Math.max(item.confidence, existing!.confidence),
          status: fromStaff ? "approved" : "pending",
        });
        attach(existing!.id);
        logActivity("pipeline", "updated entry", `#${existing!.id} ${item.title}`);
        report.updated++;
        break;
      }
      case "confirm": {
        attach(existing!.id);
        updateEntry(existing!.id, { confidence: Math.min(1, existing!.confidence + 0.05) });
        report.confirmed++;
        break;
      }
      case "conflict": {
        const id = createEntry({
          topicId: topic.id,
          type: item.type,
          title: item.title,
          body: item.body,
          confidence: item.confidence,
          owner: item.owner || null,
          tags: item.tags,
        });
        attach(id);
        createConflict(existing!.id, id, item.conflict_note || "These entries disagree.");
        report.conflicts++;
        break;
      }
    }
  }

  for (const q of result.open_questions) {
    upsertQuestion({
      question: q.question,
      topicId: q.topic ? ensureTopic(q.topic).id : null,
      assignee: q.ask || null,
      origin: "ai",
    });
    report.questions++;
  }
}

/* ---------------------------- answering ---------------------------- */

export type AskResult = AnswerResult & {
  entries: EntryHit[];
  documents: DocHit[];
  mode: "claude" | "offline";
  latency_ms: number;
};

export async function ask(
  question: string,
  opts: { channel: "ui" | "api" | "mcp"; apiKeyId?: number | null; includePending?: boolean; topic?: string } = { channel: "ui" },
): Promise<AskResult> {
  const t0 = Date.now();
  const entries = searchEntries(question, { limit: 8, includePending: opts.includePending ?? true, topicSlug: opts.topic });
  const documents = searchDocuments(question, 4);
  let result: AnswerResult;
  const mode = aiEnabled() ? "claude" : "offline";

  if (mode === "claude" && (entries.length || documents.length)) {
    const company = getSetting("company_name", "the company");
    const prompt = [
      `Company: ${company}`,
      `<knowledge_entries>\n${entries.map(renderEntry).join("\n") || "(none)"}\n</knowledge_entries>`,
      `<source_excerpts>\n${documents.map((d) => `<excerpt id="D${d.id}" title="${escapeAttr(d.title)}">${d.snippet.replace(/[«»]/g, "")}</excerpt>`).join("\n") || "(none)"}\n</source_excerpts>`,
      `<question>\n${question}\n</question>`,
    ].join("\n\n");
    result = await generateJson<AnswerResult>({ system: ANSWER_SYSTEM, prompt, schema: ANSWER_SCHEMA, effort: "low", maxTokens: 8000 });
  } else {
    result = heuristicAnswer(question, entries, documents);
  }

  if (!result.answerable) {
    upsertQuestion({
      question: result.follow_up_question || question,
      context: `Asked via ${opts.channel}: "${question}"`,
      origin: opts.channel === "ui" ? "gap" : "agent",
    });
  }

  const latency = Date.now() - t0;
  logQuery({
    channel: opts.channel,
    apiKeyId: opts.apiKeyId,
    kind: "ask",
    query: question,
    resultCount: entries.length,
    answered: result.answerable,
    latencyMs: latency,
  });

  return { ...result, entries, documents, mode, latency_ms: latency };
}

/* ---------------------------- the guide ---------------------------- */

/**
 * Rewrites chapter briefings. Only chapters whose entries changed since the last
 * briefing are rewritten unless `force` is set, so this is cheap to run often.
 */
export async function compileGuide(opts: { topicId?: number; actor?: string; force?: boolean } = {}) {
  const topics = listTopics().filter((t) => !opts.topicId || t.id === opts.topicId);
  let compiled = 0;
  for (const topic of topics) {
    const entries = all<Entry>(
      "SELECT * FROM entries WHERE topic_id = ? AND status = 'approved' ORDER BY type, title",
      topic.id,
    );
    if (!entries.length) {
      if (topic.summary) updateTopicSummary(topic.id, "");
      continue;
    }
    const lastChange = get<{ t: string | null }>(
      "SELECT max(max(updated_at, coalesce(reviewed_at, ''))) t FROM entries WHERE topic_id = ?",
      topic.id,
    )?.t;
    if (!opts.force && topic.summary && topic.summary_updated_at && lastChange && lastChange <= topic.summary_updated_at) continue;
    const conflicts = get<{ n: number }>(
      `SELECT count(*) n FROM conflicts c JOIN entries e ON e.id = c.entry_a
       WHERE c.status = 'open' AND e.topic_id = ?`,
      topic.id,
    )?.n;
    const out = aiEnabled()
      ? await generateJson<{ summary_markdown: string; one_line_description: string }>({
          system: GUIDE_SYSTEM,
          prompt: `Topic: ${topic.name}\nOpen conflicts in this topic: ${conflicts ?? 0}\n\n<entries>\n${entries.map(renderEntry).join("\n")}\n</entries>`,
          schema: GUIDE_SCHEMA,
          effort: "medium",
          maxTokens: 12000,
        })
      : heuristicTopicSummary(topic.name, entries);
    updateTopicSummary(topic.id, out.summary_markdown);
    if (out.one_line_description && !topic.description) {
      run("UPDATE topics SET description = ? WHERE id = ?", out.one_line_description, topic.id);
    }
    compiled++;
  }
  logActivity(opts.actor ?? "pipeline", "compiled guide", `${compiled} chapter${compiled === 1 ? "" : "s"}`);
  return compiled;
}

/* ---------------------------- interviews ---------------------------- */

export async function suggestInterviewQuestions(topicId: number): Promise<number> {
  const topic = listTopics().find((t) => t.id === topicId);
  if (!topic) return 0;
  const entries = all<Entry>("SELECT * FROM entries WHERE topic_id = ? AND status IN ('approved','pending')", topicId);

  let questions: { question: string; why: string }[];
  if (aiEnabled()) {
    const out = await generateJson<{ questions: { question: string; why: string }[] }>({
      system: INTERVIEW_SYSTEM,
      prompt: `Company: ${getSetting("company_name", "the company")}\nTopic: ${topic.name}\n\n<existing_entries>\n${entries.map(renderEntry).join("\n") || "(none)"}\n</existing_entries>\n\nPropose up to 5 questions.`,
      schema: INTERVIEW_SCHEMA,
      effort: "low",
      maxTokens: 4000,
    });
    questions = out.questions.slice(0, 5);
  } else {
    questions = [
      { question: `What are the rules or approval thresholds anyone working on ${topic.name.toLowerCase()} must follow?`, why: "Policies" },
      { question: `Who owns ${topic.name.toLowerCase()} and who is the escalation contact when they're out?`, why: "Ownership" },
      { question: `What is the most common mistake new people make with ${topic.name.toLowerCase()}?`, why: "Gotchas" },
    ];
  }
  for (const q of questions) upsertQuestion({ question: q.question, context: q.why, topicId, origin: "ai" });
  return questions.length;
}
