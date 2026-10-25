import { after } from "next/server";
import crypto from "node:crypto";
import { emailsToDocs, htmlToText, parseEml } from "@/lib/connectors/email";
import { processPending } from "@/lib/pipeline";
import { ensureSource, ingestDocuments } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Inbound email webhook. Forward a shared inbox (e.g. via Postmark, SendGrid
 * Inbound Parse, Mailgun routes, or Zapier) to
 *   https://<host>/api/webhooks/email?secret=EMAIL_WEBHOOK_SECRET
 * Accepts raw RFC 822 (message/rfc822), JSON ({ from, subject, text|html, date })
 * including Postmark's field names (From, Subject, TextBody, HtmlBody, Date).
 */
export async function POST(req: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  const given = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";
  if (!secret || given.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "invalid or missing secret" }, { status: 401 });
  }

  const type = req.headers.get("content-type") ?? "";
  let email;
  if (type.includes("json")) {
    const b = (await req.json()) as Record<string, string>;
    const html = b.html ?? b.HtmlBody ?? "";
    email = {
      messageId: b.messageId ?? b.MessageID ?? crypto.randomUUID(),
      subject: b.subject ?? b.Subject ?? "(no subject)",
      from: b.from ?? b.From ?? "unknown",
      date: b.date ?? b.Date ? new Date(b.date ?? b.Date).toISOString() : new Date().toISOString(),
      text: b.text ?? b.TextBody ?? htmlToText(html),
    };
  } else {
    email = await parseEml(await req.text());
  }

  const source = ensureSource("email", "Inbound email");
  const docs = emailsToDocs([email]).map((d) => ({ ...d, externalId: `${d.externalId}:${email.messageId}` }));
  const result = ingestDocuments(source.id, docs);
  after(() => processPending({ actor: "email webhook" }).catch(console.error));
  return Response.json({ ok: true, ...result });
}
