import { agentRoute, apiError, json, preflight, publicEntry } from "@/lib/api";
import { entryEvidence, getEntry } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/v1/entries/E12 (or /12) → entry with its source evidence. */
export const GET = agentRoute("read", async (_req, _auth, ctx) => {
  const { id } = await ctx.params;
  const entry = getEntry(Number(id.replace(/^E/i, "")));
  if (!entry || entry.status === "rejected") return apiError(404, "Entry not found.");
  return json({
    ...publicEntry(entry),
    evidence: entryEvidence(entry.id).map((e) => ({
      source: e.source_type,
      title: e.title,
      author: e.author,
      date: e.occurred_at,
      quote: e.quote,
    })),
  });
});
