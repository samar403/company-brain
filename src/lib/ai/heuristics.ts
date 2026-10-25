import type { EntryType } from "../types";
import type { ExtractResult } from "./prompts";

/**
 * Offline fallbacks used when no Claude credentials are configured. They keep the
 * whole product usable for demos and local development; quality is far below the
 * model path and every entry they create lands in the review queue.
 */

const SIGNALS =
  /\b(always|never|must|should|required?|policy|process|steps?|approval|approve|deadline|sla|limit|maximum|minimum|owner|owns|contact|escalate|decided|decision|going forward|from now on|we use|is called|stands for|refund|price|pricing|discount|deploy|release|onboard|holiday|expense|invoice|security|on-?call)\b/i;

const TOPIC_KEYWORDS: [string, RegExp][] = [
  ["Engineering Workflow", /\b(deploy|release|hotfix|pr|pull request|ci|staging|prod(uction)?|on-?call|incident|repo|code review|rollback)\b/i],
  ["Billing & Refunds", /\b(refund|invoice|billing|charge|payment|stripe|credit|pricing|discount|price)\b/i],
  ["Customer Support", /\b(ticket|support|customer|zendesk|sla|escalat|csat|churn)\b/i],
  ["Sales", /\b(deal|prospect|demo|quote|contract|pipeline|crm|hubspot|enterprise plan|procurement)\b/i],
  ["People & Policies", /\b(pto|vacation|holiday|leave|benefit|payroll|hiring|interview|onboarding|offboarding|expense)\b/i],
  ["Security & Compliance", /\b(security|password|sso|2fa|mfa|access|permission|vpn|soc ?2|gdpr|pii)\b/i],
  ["Product", /\b(feature|roadmap|launch|beta|spec|design|ux|feedback)\b/i],
];

function guessTopic(text: string): string {
  let best = "General";
  let bestHits = 0;
  for (const [topic, re] of TOPIC_KEYWORDS) {
    const hits = (text.match(new RegExp(re.source, "gi")) ?? []).length;
    if (hits > bestHits) {
      best = topic;
      bestHits = hits;
    }
  }
  return best;
}

function guessType(text: string): EntryType {
  if (/\?\s*$/m.test(text.split("\n")[0] ?? "")) return "faq";
  if (/\b(step|first|then|next|finally|\d\.)\b/i.test(text)) return "process";
  if (/\b(decided|decision|going forward|we will|agreed)\b/i.test(text)) return "decision";
  if (/\b(owner|owns|contact|ask|reach out|point of contact)\b/i.test(text)) return "contact";
  if (/\b(stands for|is called|means|aka)\b/i.test(text)) return "glossary";
  if (/\b(must|never|always|policy|not allowed|requires? approval)\b/i.test(text)) return "policy";
  return "fact";
}

function sentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.replace(/^\s*(\[[^\]]*\]\s*)?[\w .'-]{1,40}:\s+/, "").trim())
    .filter((s) => s.length > 25 && s.length < 400);
}

export function heuristicExtract(docs: { id: number; kind: string; title: string; content: string }[]): ExtractResult {
  const items: ExtractResult["items"] = [];
  for (const doc of docs) {
    if (doc.kind === "qa") {
      // Staff input is already distilled: keep the person's words verbatim.
      const question = doc.content.match(/^Question:\s*(.+)$/m)?.[1];
      const answer = doc.content.match(/^Answer[^:\n]*:\s*([\s\S]+)$/m)?.[1]?.trim();
      const note = doc.content.replace(/^Written by [^\n]+:\n/, "").trim();
      const body = answer ?? note;
      items.push({
        action: "create",
        target_entry_id: 0,
        type: question ? "faq" : guessType(`${doc.title}\n${body}`),
        topic: guessTopic(`${doc.title} ${body}`),
        title: (question ?? doc.title).replace(/^Q:\s*/, "").slice(0, 160),
        body,
        confidence: 0.9,
        owner: "",
        tags: [],
        evidence: [{ document_id: doc.id, quote: body.slice(0, 190) }],
        conflict_note: "",
      });
      continue;
    }
    const picked = sentences(doc.content).filter((s) => SIGNALS.test(s)).slice(0, 6);
    if (!picked.length) continue;
    const body = picked.map((s) => `- ${s}`).join("\n");
    items.push({
      action: "create",
      target_entry_id: 0,
      type: guessType(`${doc.title}\n${body}`),
      topic: guessTopic(`${doc.title} ${doc.content}`),
      title: doc.title.replace(/^(re|fwd?):\s*/i, "").slice(0, 120),
      body,
      confidence: 0.45,
      owner: "",
      tags: [],
      evidence: [{ document_id: doc.id, quote: picked[0].slice(0, 190) }],
      conflict_note: "",
    });
  }
  return { items, open_questions: [] };
}

export function heuristicAnswer(
  question: string,
  entries: { id: number; title: string; body: string; status: string }[],
  docs: { id: number; title: string; snippet: string }[],
) {
  if (!entries.length && !docs.length) {
    return {
      answer: "I couldn't find anything in the knowledge base about this yet. I've added it to the open questions so someone on the team can answer it.",
      answerable: false,
      confidence: 0,
      cited_entry_ids: [],
      cited_document_ids: [],
      follow_up_question: question,
    };
  }
  // Lexical search matches any shared word; demand that most of the question's
  // meaningful terms appear before calling it answered.
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])].filter((t) => !GENERIC.has(t));
  const covers = (text: string) => {
    const hay = text.toLowerCase();
    const hit = terms.filter((t) => hay.includes(t.slice(0, Math.max(4, t.length - 2)))).length;
    return terms.length === 0 || hit / terms.length > 0.5;
  };
  const top = entries.filter((e) => covers(`${e.title} ${e.body}`)).slice(0, 3);
  const parts = top.map(
    (e) => `**${e.title}** [E${e.id}]${e.status !== "approved" ? " _(not reviewed yet)_" : ""}\n\n${e.body}`,
  );
  if (!top.length) {
    parts.push(
      "No reviewed entry covers this yet. The closest raw sources:\n\n" +
        docs
          .slice(0, 3)
          .map((d) => `- ${d.title} [D${d.id}]: ${d.snippet.replace(/[«»]/g, "")}`)
          .join("\n"),
    );
  }
  return {
    answer: `_Offline mode: showing the best-matching knowledge. Add an Anthropic API key for written answers._\n\n${parts.join("\n\n---\n\n")}`,
    answerable: top.length > 0,
    confidence: top.length ? 0.5 : 0.2,
    cited_entry_ids: top.map((e) => e.id),
    cited_document_ids: top.length ? [] : docs.slice(0, 3).map((d) => d.id),
    follow_up_question: top.length ? "" : question,
  };
}

const GENERIC = new Set(["what", "when", "where", "which", "does", "should", "with", "policy", "about", "have", "that", "this", "there", "your", "need", "company", "customer", "customers", "after", "want", "wants", "before", "someone", "anyone"]);

export function heuristicTopicSummary(topic: string, entries: { id: number; title: string; type: string; body: string }[]) {
  const rules = entries.filter((e) => e.type === "policy");
  const procs = entries.filter((e) => e.type === "process");
  const contacts = entries.filter((e) => e.type === "contact");
  const line = (e: { id: number; title: string; body: string }) => {
    const first = (e.body.split("\n").find((l) => l.trim()) ?? "").replace(/^[-*\d.\s]+/, "").replace(/[*_`]/g, "");
    const sentence = first.match(/^.{20,220}?[.!?](\s|$)/)?.[0].trim() ?? (first.length > 220 ? `${first.slice(0, 217)}…` : first);
    return `- **${e.title}** [E${e.id}]: ${sentence}`;
  };
  const out = [`This chapter collects ${entries.length} reviewed entr${entries.length === 1 ? "y" : "ies"} about ${topic.toLowerCase()}.`];
  if (rules.length) out.push("### Rules agents must follow", ...rules.map(line));
  if (procs.length) out.push("### How things get done", ...procs.map(line));
  if (contacts.length) out.push("### Who to ask", ...contacts.map(line));
  const rest = entries.filter((e) => !["policy", "process", "contact"].includes(e.type));
  if (rest.length) out.push("### Key facts", ...rest.map(line));
  return { summary_markdown: out.join("\n\n"), one_line_description: "" };
}
