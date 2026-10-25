import { agentRoute, apiError, json, preflight } from "@/lib/api";
import { logQuery, upsertQuestion } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** POST /api/v1/gaps { "question": "...", "context"?: "what the agent was doing" }
 *  Agents report knowledge they needed but couldn't find; it lands in the staff Q&A queue. */
export const POST = agentRoute("write", async (req, auth) => {
  const body = (await req.json().catch(() => null)) as { question?: string; context?: string } | null;
  const question = body?.question?.trim();
  if (!question) return apiError(400, "Body must be JSON with a 'question' string.");
  const id = upsertQuestion({ question, context: body?.context?.slice(0, 1000) ?? null, origin: "agent" });
  logQuery({ channel: "api", apiKeyId: auth.keyId, kind: "gap", query: question, resultCount: 0, answered: false, latencyMs: 0 });
  return json({ id: `Q${id}`, status: "queued for staff" }, 201);
});
