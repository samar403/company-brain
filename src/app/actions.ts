"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  createApiKey,
  createUser,
  endSession,
  findUserByCredentials,
  requireUser,
  startSession,
  userCount,
  type Role,
} from "@/lib/auth";
import { parseUpload } from "@/lib/connectors/files";
import { syncSlack } from "@/lib/connectors/slack";
import { get, logActivity, run, setSetting } from "@/lib/db";
import { loadDemoData } from "@/lib/demo";
import { ask, compileGuide, processPending, suggestInterviewQuestions } from "@/lib/pipeline";
import {
  answerQuestion,
  createEntry,
  deleteEntry,
  deleteSource,
  dismissQuestion,
  ensureSource,
  ensureTopic,
  getEntry,
  getQuestion,
  getSource,
  ingestDocuments,
  resolveConflict,
  reviewEntry,
  setSourceStatus,
  updateEntry,
  upsertQuestion,
} from "@/lib/store";
import { ENTRY_TYPES, type EntryType } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, msg: { notice?: string; error?: string }): never =>
  redirect(`${path}?${new URLSearchParams(msg as Record<string, string>)}`);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ------------------------------ auth ------------------------------ */

export async function setupAction(form: FormData) {
  if (userCount() > 0) redirect("/login");
  const email = str(form, "email");
  const password = str(form, "password");
  const name = str(form, "name");
  if (!email.includes("@") || password.length < 8 || !name) {
    back("/setup", { error: "Enter your name, a valid email and a password of at least 8 characters." });
  }
  setSetting("company_name", str(form, "company") || "Your company");
  const id = createUser(email, name, password, "admin");
  logActivity(name, "created the workspace");
  if (form.get("demo") === "on") loadDemoData(name);
  await startSession(id);
  redirect("/dashboard");
}

export async function loginAction(form: FormData) {
  const user = findUserByCredentials(str(form, "email"), str(form, "password"));
  if (!user) back("/login", { error: "That email and password don't match." });
  await startSession(user!.id);
  const next = str(form, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

/* ----------------------------- sources ----------------------------- */

export async function loadDemoAction() {
  const user = await requireUser("admin");
  loadDemoData(user.name);
  revalidatePath("/", "layout");
  back("/sources", { notice: "Loaded the Northwind Labs demo: Slack threads, email and staff answers, already turned into a guide." });
}

export async function syncSlackAction(form: FormData) {
  const user = await requireUser("editor");
  const token = str(form, "token") || process.env.SLACK_BOT_TOKEN || "";
  if (!token) back("/sources", { error: "Add a Slack bot token (or set SLACK_BOT_TOKEN) to sync Slack." });
  const channels = str(form, "channels")
    .split(/[\s,]+/)
    .map((c) => c.replace(/^#/, ""))
    .filter(Boolean);
  const source = ensureSource("slack", "Slack workspace", { channels });
  setSourceStatus(source.id, "syncing");
  try {
    const oldest = source.last_synced_at ? String(Math.floor(new Date(`${source.last_synced_at}Z`).getTime() / 1000) - 86400) : undefined;
    const { docs, channels: synced } = await syncSlack({ token, channels, oldest });
    const r = ingestDocuments(source.id, docs);
    setSourceStatus(source.id, "idle");
    logActivity(user.name, "synced Slack", `${synced.length} channels, ${r.added} new and ${r.updated} updated threads`);
    revalidatePath("/", "layout");
    back("/sources", {
      notice: `Synced ${synced.length} channel${synced.length === 1 ? "" : "s"}: ${r.added} new, ${r.updated} updated threads${r.redactions ? `, ${r.redactions} secrets redacted` : ""}. Run the pipeline to extract knowledge.`,
    });
  } catch (e) {
    unstable_rethrow(e);
    setSourceStatus(source.id, "error", errMsg(e));
    back("/sources", { error: errMsg(e) });
  }
}

export async function uploadAction(form: FormData) {
  const user = await requireUser("editor");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) back("/sources", { error: "Choose at least one file." });
  let added = 0;
  let updated = 0;
  let redactions = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const parsed = await parseUpload(file);
      const source =
        parsed.kind === "slack"
          ? ensureSource("slack", "Slack export")
          : parsed.kind === "email"
            ? ensureSource("email", "Email archive")
            : ensureSource("upload", "Uploaded documents");
      const r = ingestDocuments(source.id, parsed.docs);
      setSourceStatus(source.id, "idle");
      added += r.added;
      updated += r.updated;
      redactions += r.redactions;
    } catch (e) {
      errors.push(errMsg(e));
    }
  }
  logActivity(user.name, "uploaded files", `${files.length} files → ${added} new documents`);
  revalidatePath("/", "layout");
  if (form.get("process") === "on" && added + updated > 0) {
    const report = await processPending({ actor: user.name });
    back("/review", {
      notice: `Imported ${added + updated} documents and extracted ${report.created} new entries (${report.mode}). Review them below.${errors.length ? ` Skipped: ${errors.join("; ")}` : ""}`,
    });
  }
  back("/sources", {
    ...(errors.length ? { error: errors.join(" ") } : {}),
    notice: `Imported ${added} new and ${updated} updated documents${redactions ? `, ${redactions} secrets redacted` : ""}.`,
  });
}

export async function addNoteAction(form: FormData) {
  const user = await requireUser("editor");
  const title = str(form, "title");
  const content = str(form, "content");
  if (content.length < 20) back("/sources", { error: "Write at least a sentence or two." });
  const source = ensureSource("staff", "Staff notes");
  ingestDocuments(source.id, [
    {
      externalId: `note:${Date.now()}`,
      kind: "qa",
      title: title || content.split("\n")[0].slice(0, 80),
      author: user.name,
      content: `Written by ${user.name}:\n${content}`,
      occurredAt: new Date().toISOString(),
    },
  ]);
  const report = await processPending({ actor: user.name });
  revalidatePath("/", "layout");
  back("/knowledge", { notice: `Saved. ${report.created + report.updated} entries created or updated from your note.` });
}

export async function deleteSourceAction(form: FormData) {
  const user = await requireUser("admin");
  const id = Number(form.get("id"));
  const source = getSource(id);
  if (source) {
    deleteSource(id);
    logActivity(user.name, "removed source", source.name);
  }
  revalidatePath("/", "layout");
  back("/sources", { notice: "Source and its documents removed. Entries that relied on it keep their text." });
}

export async function runPipelineAction(form: FormData) {
  const user = await requireUser("editor");
  const returnTo = str(form, "returnTo") || "/dashboard";
  try {
    const report = await processPending({ actor: user.name, limit: 80 });
    const chapters = await compileGuide({ actor: user.name });
    revalidatePath("/", "layout");
    back(returnTo, {
      notice: report.documents
        ? `Read ${report.documents} documents: ${report.created} new entries, ${report.updated} updated, ${report.confirmed} confirmed, ${report.conflicts} conflicts. Refreshed ${chapters} guide chapters.${report.errors.length ? ` Errors: ${report.errors[0]}` : ""}`
        : `Nothing new to read. ${chapters ? `Refreshed ${chapters} guide chapters.` : "The guide is up to date."}`,
    });
  } catch (e) {
    unstable_rethrow(e);
    back(returnTo, { error: `Pipeline failed: ${errMsg(e)}` });
  }
}

/* ----------------------------- entries ----------------------------- */

export async function reviewEntryAction(form: FormData) {
  const user = await requireUser("editor");
  const id = Number(form.get("id"));
  const status = str(form, "status") as "approved" | "rejected" | "stale";
  if (!["approved", "rejected", "stale"].includes(status)) return;
  reviewEntry(id, status, user.id);
  const e = getEntry(id);
  logActivity(user.name, `${status} entry`, `#${id} ${e?.title ?? ""}`);
  revalidatePath("/", "layout");
}

export async function bulkApproveAction(form: FormData) {
  const user = await requireUser("editor");
  const min = Number(form.get("min") ?? 0.85);
  const r = run(
    "UPDATE entries SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE status = 'pending' AND confidence >= ? AND id NOT IN (SELECT entry_a FROM conflicts WHERE status='open' UNION SELECT entry_b FROM conflicts WHERE status='open')",
    user.id,
    min,
  );
  logActivity(user.name, "bulk-approved entries", `${r.changes} entries with confidence ≥ ${Math.round(min * 100)}%`);
  revalidatePath("/", "layout");
  back("/review", { notice: `Approved ${r.changes} high-confidence entries.` });
}

export async function saveEntryAction(form: FormData) {
  const user = await requireUser("editor");
  const id = Number(form.get("id") || 0);
  const type = str(form, "type") as EntryType;
  const title = str(form, "title");
  const body = str(form, "body");
  if (!title || !body || !ENTRY_TYPES.includes(type)) back(id ? `/knowledge/${id}` : "/knowledge/new", { error: "Title, body and type are required." });
  const topic = ensureTopic(str(form, "topic") || "General");
  const owner = str(form, "owner") || null;
  if (id) {
    updateEntry(id, { title, body, type, topic_id: topic.id, owner });
    reviewEntry(id, "approved", user.id);
    run("UPDATE entries SET origin = 'human' WHERE id = ?", id);
    logActivity(user.name, "edited entry", `#${id} ${title}`);
  } else {
    const newId = createEntry({ topicId: topic.id, type, title, body, owner, confidence: 1, status: "approved", origin: "human" });
    logActivity(user.name, "wrote entry", `#${newId} ${title}`);
    revalidatePath("/", "layout");
    redirect(`/knowledge/${newId}?notice=Saved`);
  }
  revalidatePath("/", "layout");
  back(`/knowledge/${id}`, { notice: "Saved and marked as reviewed." });
}

export async function deleteEntryAction(form: FormData) {
  const user = await requireUser("admin");
  const id = Number(form.get("id"));
  deleteEntry(id);
  logActivity(user.name, "deleted entry", `#${id}`);
  revalidatePath("/", "layout");
  back("/knowledge", { notice: "Entry deleted." });
}

export async function resolveConflictAction(form: FormData) {
  const user = await requireUser("editor");
  const id = Number(form.get("id"));
  const keep = Number(form.get("keep") || 0);
  const conflict = get<{ entry_a: number; entry_b: number }>("SELECT entry_a, entry_b FROM conflicts WHERE id = ?", id);
  if (!conflict) return;
  if (keep) {
    const drop = keep === conflict.entry_a ? conflict.entry_b : conflict.entry_a;
    reviewEntry(keep, "approved", user.id);
    reviewEntry(drop, "rejected", user.id);
    resolveConflict(id, "resolved");
    logActivity(user.name, "resolved conflict", `kept #${keep}, rejected #${drop}`);
  } else {
    resolveConflict(id, "dismissed");
    logActivity(user.name, "dismissed conflict", `#${id}`);
  }
  revalidatePath("/", "layout");
}

/* ---------------------------- questions ---------------------------- */

export async function answerQuestionAction(form: FormData) {
  const user = await requireUser("editor");
  const id = Number(form.get("id"));
  const answer = str(form, "answer");
  const q = getQuestion(id);
  if (!q || answer.length < 3) back("/interviews", { error: "Write an answer first." });
  answerQuestion(id, answer, user.name);
  const source = ensureSource("staff", "Staff interviews");
  ingestDocuments(source.id, [
    {
      externalId: `question:${id}`,
      kind: "qa",
      title: `Q: ${q!.question}`,
      author: user.name,
      content: `Question: ${q!.question}${q!.context ? `\nContext: ${q!.context}` : ""}\nAnswer (${user.name}): ${answer}`,
      occurredAt: new Date().toISOString(),
    },
  ]);
  const report = await processPending({ actor: user.name });
  logActivity(user.name, "answered a question", q!.question);
  revalidatePath("/", "layout");
  back("/interviews", {
    notice: `Thanks! Your answer became ${report.created + report.updated} knowledge entr${report.created + report.updated === 1 ? "y" : "ies"} and is live for agents.`,
  });
}

export async function dismissQuestionAction(form: FormData) {
  await requireUser("editor");
  dismissQuestion(Number(form.get("id")));
  revalidatePath("/", "layout");
}

export async function addQuestionAction(form: FormData) {
  await requireUser("editor");
  const question = str(form, "question");
  if (question.length < 5) back("/interviews", { error: "Write a question." });
  const topic = str(form, "topic");
  upsertQuestion({
    question,
    assignee: str(form, "assignee") || null,
    topicId: topic ? ensureTopic(topic).id : null,
    origin: "manual",
  });
  revalidatePath("/", "layout");
  back("/interviews", { notice: "Question added to the interview queue." });
}

export async function suggestQuestionsAction(form: FormData) {
  await requireUser("editor");
  const topicId = Number(form.get("topicId"));
  try {
    const n = await suggestInterviewQuestions(topicId);
    revalidatePath("/", "layout");
    back("/interviews", { notice: `Added ${n} suggested questions.` });
  } catch (e) {
    unstable_rethrow(e);
    back("/interviews", { error: errMsg(e) });
  }
}

/* ------------------------------ guide ------------------------------ */

export async function compileGuideAction(form: FormData) {
  const user = await requireUser("editor");
  const topicId = Number(form.get("topicId") || 0) || undefined;
  const returnTo = str(form, "returnTo") || "/guide";
  try {
    const n = await compileGuide({ topicId, actor: user.name, force: Boolean(topicId) });
    revalidatePath("/", "layout");
    back(returnTo, { notice: n ? `Rewrote ${n} chapter${n === 1 ? "" : "s"} from the latest reviewed knowledge.` : "Every chapter is already up to date." });
  } catch (e) {
    unstable_rethrow(e);
    back(returnTo, { error: errMsg(e) });
  }
}

/* ------------------------------- ask ------------------------------- */

export type AskState = {
  question: string;
  answer?: string;
  answerable?: boolean;
  confidence?: number;
  citations?: { id: number; title: string; status: string; topic: string | null }[];
  mode?: string;
  latency?: number;
  error?: string;
};

export async function askAction(_prev: AskState | null, form: FormData): Promise<AskState> {
  await requireUser("viewer");
  const question = str(form, "question");
  if (!question) return { question, error: "Type a question." };
  try {
    const r = await ask(question, { channel: "ui", includePending: true });
    const cited = new Set(r.cited_entry_ids);
    return {
      question,
      answer: r.answer,
      answerable: r.answerable,
      confidence: r.confidence,
      citations: r.entries
        .filter((e) => cited.has(e.id))
        .map((e) => ({ id: e.id, title: e.title, status: e.status, topic: e.topic_name })),
      mode: r.mode,
      latency: r.latency_ms,
    };
  } catch (e) {
    return { question, error: errMsg(e) };
  }
}

/* ------------------------------ agents ------------------------------ */

export type KeyState = { secret?: string; error?: string };

export async function createKeyAction(_prev: KeyState | null, form: FormData): Promise<KeyState> {
  const user = await requireUser("admin");
  const name = str(form, "name");
  if (!name) return { error: "Name the key after the agent that will use it." };
  const scopes = form.get("write") === "on" ? ["read", "write"] : ["read"];
  const secret = createApiKey(name, scopes, user.id);
  logActivity(user.name, "created API key", name);
  revalidatePath("/agents");
  return { secret };
}

export async function revokeKeyAction(form: FormData) {
  const user = await requireUser("admin");
  const id = Number(form.get("id"));
  run("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?", id);
  logActivity(user.name, "revoked API key", `#${id}`);
  revalidatePath("/agents");
}

/* ----------------------------- settings ----------------------------- */

export async function saveSettingsAction(form: FormData) {
  const user = await requireUser("admin");
  setSetting("company_name", str(form, "company") || "Your company");
  const threshold = str(form, "auto_approve");
  setSetting("auto_approve_threshold", threshold === "off" ? "1.1" : threshold);
  logActivity(user.name, "updated settings");
  revalidatePath("/", "layout");
  back("/settings", { notice: "Settings saved." });
}

export async function addUserAction(form: FormData) {
  const user = await requireUser("admin");
  const email = str(form, "email");
  const password = str(form, "password");
  const role = str(form, "role") as Role;
  if (!email.includes("@") || password.length < 8 || !["admin", "editor", "viewer"].includes(role)) {
    back("/settings", { error: "Use a valid email, a role, and a temporary password of 8+ characters." });
  }
  try {
    createUser(email, str(form, "name") || email.split("@")[0], password, role);
  } catch {
    back("/settings", { error: "A user with that email already exists." });
  }
  logActivity(user.name, "added teammate", `${email} as ${role}`);
  revalidatePath("/settings");
  back("/settings", { notice: `Added ${email}. Share the temporary password with them directly.` });
}

export async function removeUserAction(form: FormData) {
  const user = await requireUser("admin");
  const id = Number(form.get("id"));
  if (id === user.id) back("/settings", { error: "You can't remove yourself." });
  run("DELETE FROM users WHERE id = ?", id);
  logActivity(user.name, "removed teammate", `#${id}`);
  revalidatePath("/settings");
}
