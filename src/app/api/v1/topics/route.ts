import { agentRoute, json, preflight } from "@/lib/api";
import { listTopics } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = agentRoute("read", async () =>
  json({
    topics: listTopics()
      .filter((t) => t.approved_count > 0)
      .map((t) => ({ slug: t.slug, name: t.name, description: t.description, entries: t.approved_count })),
  }),
);
