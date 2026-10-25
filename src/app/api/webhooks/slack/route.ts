import { after } from "next/server";
import { messagesToDocs, verifySlackSignature } from "@/lib/connectors/slack";
import { get } from "@/lib/db";
import { processPending } from "@/lib/pipeline";
import { ensureSource, ingestDocuments } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Slack Events API endpoint. In your Slack app, set the Request URL to
 * https://<host>/api/webhooks/slack and subscribe to message.channels.
 * Each new message re-ingests its thread; extraction runs after the response.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return new Response("SLACK_SIGNING_SECRET is not configured", { status: 503 });
  if (!verifySlackSignature(secret, raw, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"))) {
    return new Response("bad signature", { status: 401 });
  }
  const body = JSON.parse(raw);
  if (body.type === "url_verification") return Response.json({ challenge: body.challenge });

  const ev = body.event;
  if (body.type === "event_callback" && ev?.type === "message" && ev.text && !ev.bot_id && !ev.subtype) {
    const channel = ev.channel_name ?? ev.channel;
    const source = ensureSource("slack", "Slack (live events)");
    // Thread replies are appended to the stored thread document so context is kept.
    const docs = messagesToDocs(channel, [{ ...ev, user_name: ev.user }], new Map());
    for (const doc of docs) {
      const prev = get<{ content: string }>("SELECT content FROM documents WHERE source_id = ? AND external_id = ?", source.id, doc.externalId);
      if (prev) doc.content = `${prev.content}\n${doc.content}`;
    }
    ingestDocuments(source.id, docs);
    after(() => processPending({ actor: "slack webhook" }).catch(console.error));
  }
  return new Response("ok");
}
