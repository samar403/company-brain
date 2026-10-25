import { agentRoute, json, preflight } from "@/lib/api";
import { buildGuide, guideToMarkdown } from "@/lib/guide";
import { logQuery } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/v1/guide            → JSON
 *  GET /api/v1/guide?format=md  → Markdown, ready to paste into a system prompt or AGENTS.md
 *  GET /api/v1/guide?topic=slug → one chapter */
export const GET = agentRoute("read", async (req, auth) => {
  const url = new URL(req.url);
  const guide = buildGuide({ topic: url.searchParams.get("topic") ?? undefined });
  logQuery({ channel: "api", apiKeyId: auth.keyId, kind: "guide", query: url.searchParams.get("topic") ?? "(full guide)", resultCount: guide.chapters.length, answered: true, latencyMs: 0 });
  if (url.searchParams.get("format") === "md" || req.headers.get("accept")?.includes("text/markdown")) {
    return new Response(guideToMarkdown(guide), {
      headers: { "content-type": "text/markdown; charset=utf-8", "access-control-allow-origin": "*" },
    });
  }
  return json(guide);
});
