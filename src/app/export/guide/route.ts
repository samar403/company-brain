import { currentUser } from "@/lib/auth";
import { buildGuide, guideToMarkdown } from "@/lib/guide";

export const dynamic = "force-dynamic";

/** Signed-in download of the guide: /export/guide?format=md|json */
export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });
  const format = new URL(req.url).searchParams.get("format") ?? "md";
  const guide = buildGuide();
  const name = guide.company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (format === "json") {
    return new Response(JSON.stringify(guide, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${name}-guide.json"` },
    });
  }
  return new Response(guideToMarkdown(guide), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${name}-AGENTS.md"` },
  });
}
