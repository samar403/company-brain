import { agentRoute, json, apiError, preflight, publicEntry } from "@/lib/api";
import { ask } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const OPTIONS = preflight;

/** POST /api/v1/ask { "question": "...", "topic"?: "slug", "include_unreviewed"?: boolean } */
export const POST = agentRoute("read", async (req, auth) => {
  const body = (await req.json().catch(() => null)) as { question?: string; topic?: string; include_unreviewed?: boolean } | null;
  const question = body?.question?.trim();
  if (!question) return apiError(400, "Body must be JSON with a 'question' string.");
  if (question.length > 2000) return apiError(400, "Question is too long (2000 characters max).");
  const r = await ask(question, { channel: "api", apiKeyId: auth.keyId, topic: body?.topic, includePending: body?.include_unreviewed ?? false });
  const cited = new Set(r.cited_entry_ids);
  return json({
    answer: r.answer,
    answerable: r.answerable,
    confidence: r.confidence,
    citations: r.entries.filter((e) => cited.has(e.id)).map(publicEntry),
    related: r.entries.filter((e) => !cited.has(e.id)).slice(0, 5).map((e) => ({ id: `E${e.id}`, title: e.title })),
    gap_recorded: !r.answerable,
    mode: r.mode,
    latency_ms: r.latency_ms,
  });
});
