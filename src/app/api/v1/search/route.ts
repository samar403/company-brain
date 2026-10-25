import { agentRoute, json, apiError, preflight, publicEntry } from "@/lib/api";
import { searchDocuments, searchEntries } from "@/lib/search";
import { logQuery } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/v1/search?q=refund+policy&limit=5&topic=billing-and-refunds&include_unreviewed=true&include_sources=true */
export const GET = agentRoute("read", async (req, auth) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return apiError(400, "Query parameter 'q' is required.");
  const t0 = Date.now();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 8) || 8, 25);
  const entries = searchEntries(q, {
    limit,
    includePending: url.searchParams.get("include_unreviewed") === "true",
    topicSlug: url.searchParams.get("topic") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  });
  const sources = url.searchParams.get("include_sources") === "true" ? searchDocuments(q, 5) : [];
  logQuery({ channel: "api", apiKeyId: auth.keyId, kind: "search", query: q, resultCount: entries.length, answered: entries.length > 0, latencyMs: Date.now() - t0 });
  return json({
    query: q,
    results: entries.map(publicEntry),
    sources: sources.map((d) => ({ id: `D${d.id}`, title: d.title, type: d.source_type, date: d.occurred_at, snippet: d.snippet.replace(/[«»]/g, "") })),
  });
});
