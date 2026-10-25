import "server-only";
import PostalMime from "postal-mime";
import type { IncomingDoc } from "../types";

/**
 * Email connector. Accepts .eml files, .mbox archives (Gmail Takeout, Thunderbird,
 * Apple Mail export) and JSON posted by an inbound-email service (Postmark,
 * SendGrid Inbound Parse, Mailgun routes, or a Gmail/Outlook forwarding rule) at
 * /api/webhooks/email. Messages are grouped into threads by normalized subject and
 * quoted replies are stripped so each message is counted once.
 */

export type ParsedEmail = {
  messageId: string;
  subject: string;
  from: string;
  to?: string;
  date?: string;
  text: string;
};

export async function parseEml(raw: string | ArrayBuffer): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw);
  const text = email.text?.trim() || htmlToText(email.html ?? "");
  return {
    messageId: email.messageId ?? `${email.subject}-${email.date}`,
    subject: email.subject ?? "(no subject)",
    from: email.from ? `${email.from.name ?? ""} <${email.from.address ?? ""}>`.trim() : "unknown",
    to: email.to?.map((t) => t.address).join(", "),
    date: email.date ? new Date(email.date).toISOString() : undefined,
    text,
  };
}

export async function parseMbox(raw: string): Promise<ParsedEmail[]> {
  const chunks = raw.split(/\r?\n(?=From [^\n]*\d{4}\r?\n)/);
  const out: ParsedEmail[] = [];
  for (const chunk of chunks) {
    const body = chunk.replace(/^From [^\n]*\n/, "");
    if (body.trim().length < 20) continue;
    try {
      out.push(await parseEml(body));
    } catch {
      // skip malformed message
    }
  }
  return out;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Removes quoted history and signatures so a thread doesn't repeat itself. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From: .+/.test(line) && out.length > 3) break;
    if (/^--\s*$/.test(line)) break; // signature delimiter
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

export const normalizeSubject = (s: string) =>
  s.replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?:\s*)+/i, "").trim() || "(no subject)";

export function emailsToDocs(emails: ParsedEmail[]): IncomingDoc[] {
  const threads = new Map<string, ParsedEmail[]>();
  for (const e of emails) {
    const key = normalizeSubject(e.subject).toLowerCase();
    threads.set(key, [...(threads.get(key) ?? []), e]);
  }
  return [...threads.values()].map((msgs) => {
    msgs.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const subject = normalizeSubject(msgs[0].subject);
    return {
      externalId: `thread:${subject.toLowerCase()}`,
      kind: "email_thread" as const,
      title: subject,
      author: msgs[0].from,
      content: msgs
        .map((m) => `From: ${m.from}\nDate: ${m.date ?? "unknown"}\n\n${stripQuoted(m.text)}`)
        .join("\n\n---\n\n"),
      occurredAt: msgs[0].date,
    };
  });
}
