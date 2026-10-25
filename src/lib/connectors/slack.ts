import "server-only";
import crypto from "node:crypto";
import JSZip from "jszip";
import type { IncomingDoc } from "../types";

/**
 * Slack connector. Three ways in:
 *  1. Live sync through the Web API with a bot token (SLACK_BOT_TOKEN, scopes:
 *     channels:history, channels:read, users:read). The bot reads channels it was invited to.
 *  2. A workspace export ZIP (Workspace settings → Import/Export data).
 *  3. The Events API webhook at /api/webhooks/slack for near-real-time capture.
 * Messages are grouped into one document per thread; loose messages are grouped
 * per channel per day so short exchanges keep their context.
 */

type SlackMessage = {
  ts: string;
  thread_ts?: string;
  user?: string;
  user_name?: string;
  user_profile?: { real_name?: string; display_name?: string };
  text?: string;
  subtype?: string;
  reply_count?: number;
  bot_id?: string;
};

const SKIP_SUBTYPES = new Set(["channel_join", "channel_leave", "channel_topic", "channel_purpose", "bot_message", "tombstone"]);

function cleanText(text: string, names: Map<string, string>): string {
  return text
    .replace(/<@([A-Z0-9]+)(\|[^>]+)?>/g, (_m, id) => `@${names.get(id) ?? id}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const tsToIso = (ts: string) => new Date(Number(ts.split(".")[0]) * 1000).toISOString();

function author(m: SlackMessage, names: Map<string, string>) {
  return m.user_profile?.real_name || m.user_name || (m.user ? names.get(m.user) : undefined) || m.user || "unknown";
}

export function messagesToDocs(
  channel: string,
  messages: SlackMessage[],
  names: Map<string, string>,
  workspaceUrl?: string,
): IncomingDoc[] {
  const usable = messages.filter((m) => m.text && !SKIP_SUBTYPES.has(m.subtype ?? "") && !m.bot_id);
  const threads = new Map<string, SlackMessage[]>();
  const loose = new Map<string, SlackMessage[]>();

  for (const m of usable) {
    const root = m.thread_ts ?? (m.reply_count ? m.ts : undefined);
    if (root) {
      threads.set(root, [...(threads.get(root) ?? []), m]);
    } else {
      const day = tsToIso(m.ts).slice(0, 10);
      loose.set(day, [...(loose.get(day) ?? []), m]);
    }
  }

  const docs: IncomingDoc[] = [];
  const render = (msgs: SlackMessage[]) =>
    msgs
      .sort((a, b) => Number(a.ts) - Number(b.ts))
      .map((m) => `[${tsToIso(m.ts).slice(0, 16).replace("T", " ")}] ${author(m, names)}: ${cleanText(m.text!, names)}`)
      .join("\n");

  for (const [root, msgs] of threads) {
    const first = msgs.find((m) => m.ts === root) ?? msgs[0];
    const firstLine = cleanText(first.text ?? "", names).split("\n")[0].slice(0, 90);
    docs.push({
      externalId: `${channel}:${root}`,
      kind: "slack_thread",
      title: `#${channel}: ${firstLine}`,
      author: author(first, names),
      channel: `#${channel}`,
      url: workspaceUrl ? `${workspaceUrl}/archives/${channel}/p${root.replace(".", "")}` : undefined,
      content: render(msgs),
      occurredAt: tsToIso(root),
    });
  }
  for (const [day, msgs] of loose) {
    if (msgs.length < 2 && (msgs[0].text?.length ?? 0) < 80) continue; // drop lone chit-chat
    docs.push({
      externalId: `${channel}:day:${day}`,
      kind: "slack_thread",
      title: `#${channel} on ${day}`,
      channel: `#${channel}`,
      content: render(msgs),
      occurredAt: `${day}T12:00:00.000Z`,
    });
  }
  return docs;
}

/* ---------------- Web API sync ---------------- */

async function slackApi<T>(token: string, method: string, params: Record<string, string>): Promise<T> {
  const url = `https://slack.com/api/${method}?${new URLSearchParams(params)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after") ?? 2) * 1000));
      continue;
    }
    const body = (await res.json()) as { ok: boolean; error?: string } & T;
    if (!body.ok) throw new Error(`Slack ${method} failed: ${body.error}`);
    return body;
  }
  throw new Error(`Slack ${method} kept rate-limiting`);
}

export async function syncSlack(opts: {
  token: string;
  channels?: string[];
  oldest?: string;
  maxMessagesPerChannel?: number;
}): Promise<{ docs: IncomingDoc[]; channels: string[] }> {
  const { token } = opts;
  const auth = await slackApi<{ url: string }>(token, "auth.test", {});
  const list = await slackApi<{ channels: { id: string; name: string; is_member: boolean }[] }>(token, "conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: "true",
    limit: "200",
  });
  const wanted = list.channels.filter(
    (c) => c.is_member && (!opts.channels?.length || opts.channels.includes(c.name) || opts.channels.includes(c.id)),
  );

  const names = new Map<string, string>();
  const resolve = async (id?: string) => {
    if (!id || names.has(id)) return;
    try {
      const u = await slackApi<{ user: { real_name?: string; name: string } }>(token, "users.info", { user: id });
      names.set(id, u.user.real_name || u.user.name);
    } catch {
      names.set(id, id);
    }
  };

  const docs: IncomingDoc[] = [];
  for (const ch of wanted) {
    const messages: SlackMessage[] = [];
    let cursor = "";
    const cap = opts.maxMessagesPerChannel ?? 1000;
    do {
      const page = await slackApi<{ messages: SlackMessage[]; response_metadata?: { next_cursor?: string } }>(
        token,
        "conversations.history",
        { channel: ch.id, limit: "200", ...(opts.oldest ? { oldest: opts.oldest } : {}), ...(cursor ? { cursor } : {}) },
      );
      messages.push(...page.messages);
      cursor = page.response_metadata?.next_cursor ?? "";
    } while (cursor && messages.length < cap);

    for (const m of messages.filter((m) => m.reply_count)) {
      const replies = await slackApi<{ messages: SlackMessage[] }>(token, "conversations.replies", {
        channel: ch.id,
        ts: m.ts,
        limit: "200",
      });
      messages.push(...replies.messages.filter((r) => r.ts !== m.ts));
    }
    for (const m of messages) await resolve(m.user);
    docs.push(...messagesToDocs(ch.name, messages, names, auth.url.replace(/\/$/, "")));
  }
  return { docs, channels: wanted.map((c) => c.name) };
}

/* ---------------- Export ZIP ---------------- */

export async function parseSlackExport(buf: ArrayBuffer): Promise<IncomingDoc[]> {
  const zip = await JSZip.loadAsync(buf);
  const names = new Map<string, string>();
  const usersFile = zip.file(/(^|\/)users\.json$/)[0];
  if (usersFile) {
    const users = JSON.parse(await usersFile.async("string")) as { id: string; name: string; real_name?: string; profile?: { real_name?: string } }[];
    for (const u of users) names.set(u.id, u.profile?.real_name || u.real_name || u.name);
  }
  const byChannel = new Map<string, SlackMessage[]>();
  for (const file of zip.file(/[^/]+\/\d{4}-\d{2}-\d{2}\.json$/)) {
    const parts = file.name.split("/");
    const channel = parts[parts.length - 2];
    const msgs = JSON.parse(await file.async("string")) as SlackMessage[];
    byChannel.set(channel, [...(byChannel.get(channel) ?? []), ...msgs]);
  }
  return [...byChannel].flatMap(([channel, msgs]) => messagesToDocs(channel, msgs, names));
}

/* ---------------- Events API ---------------- */

/** Verifies Slack's request signature (v0) against SLACK_SIGNING_SECRET. */
export function verifySlackSignature(secret: string, body: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
