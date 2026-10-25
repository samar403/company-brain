import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuth } from "./auth";
import { buildGuide, guideToMarkdown } from "./guide";
import { ask } from "./pipeline";
import { searchEntries } from "./search";
import { entryEvidence, getEntry, listTopics, logQuery, upsertQuestion } from "./store";
import { getSetting } from "./db";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

function formatEntry(e: { id: number; title: string; body: string; status: string; topic_name?: string | null; owner: string | null; confidence: number }) {
  return [
    `[E${e.id}] ${e.title}${e.status !== "approved" ? " (NOT REVIEWED)" : ""}`,
    `topic: ${e.topic_name ?? "-"} · owner: ${e.owner ?? "-"} · confidence: ${Math.round(e.confidence * 100)}%`,
    e.body,
  ].join("\n");
}

/** Builds a fresh MCP server bound to one authenticated API key (stateless transport). */
export function createMcpServer(auth: AgentAuth) {
  const company = getSetting("company_name", "the company");
  const server = new McpServer(
    { name: "company-brain", version: "1.0.0" },
    {
      instructions: `Company Brain holds ${company}'s reviewed operating knowledge: policies, processes, decisions, owners and FAQs extracted from Slack, email and staff. Before acting on ${company}'s behalf, check it: use search_knowledge for lookups, ask_company_brain for a cited answer, get_guide for a full briefing. If nothing covers your situation, call report_knowledge_gap instead of guessing.`,
    },
  );

  server.registerTool(
    "search_knowledge",
    {
      title: "Search company knowledge",
      description: "Full-text search over reviewed knowledge entries (policies, processes, decisions, FAQs, owners). Returns the best matches with their ids.",
      inputSchema: {
        query: z.string().min(2).describe("What you need to know, in plain words"),
        topic: z.string().optional().describe("Optional topic slug from list_topics"),
        limit: z.number().int().min(1).max(20).optional(),
        include_unreviewed: z.boolean().optional().describe("Also return AI-extracted entries not yet reviewed by a human"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, topic, limit, include_unreviewed }) => {
      const t0 = Date.now();
      const hits = searchEntries(query, { topicSlug: topic, limit: limit ?? 6, includePending: include_unreviewed ?? false });
      logQuery({ channel: "mcp", apiKeyId: auth.keyId, kind: "search", query, resultCount: hits.length, answered: hits.length > 0, latencyMs: Date.now() - t0 });
      if (!hits.length) return text(`No knowledge found for "${query}". If this matters for your task, call report_knowledge_gap.`);
      return text(hits.map(formatEntry).join("\n\n---\n\n"));
    },
  );

  server.registerTool(
    "ask_company_brain",
    {
      title: "Ask Company Brain",
      description: "Ask a natural-language question and get a short answer written from the knowledge base, with [E#] citations. Unanswerable questions are queued for staff automatically.",
      inputSchema: { question: z.string().min(3).max(2000) },
      annotations: { readOnlyHint: false },
    },
    async ({ question }) => {
      const r = await ask(question, { channel: "mcp", apiKeyId: auth.keyId, includePending: false });
      const cited = r.entries.filter((e) => r.cited_entry_ids.includes(e.id));
      return text(
        [
          r.answer,
          cited.length ? `\nSources: ${cited.map((e) => `[E${e.id}] ${e.title}`).join("; ")}` : "",
          r.answerable ? "" : "\n(This gap was recorded for the team to answer.)",
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get the operating guide",
      description: "Returns the company operating guide as Markdown: rules, processes and owners per topic. Pass a topic slug to get one chapter.",
      inputSchema: { topic: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ topic }) => {
      logQuery({ channel: "mcp", apiKeyId: auth.keyId, kind: "guide", query: topic ?? "(full guide)", resultCount: 1, answered: true, latencyMs: 0 });
      return text(guideToMarkdown(buildGuide({ topic })));
    },
  );

  server.registerTool(
    "list_topics",
    {
      title: "List topics",
      description: "Lists the guide's topics with their slugs and entry counts.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      text(
        listTopics()
          .filter((t) => t.approved_count > 0)
          .map((t) => `${t.slug} — ${t.name} (${t.approved_count} entries)${t.description ? `: ${t.description}` : ""}`)
          .join("\n") || "No topics yet.",
      ),
  );

  server.registerTool(
    "get_entry",
    {
      title: "Get an entry with sources",
      description: "Fetch one knowledge entry by id (e.g. E12) including the Slack/email/staff evidence it came from.",
      inputSchema: { id: z.string().describe("Entry id such as E12") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const e = getEntry(Number(id.replace(/^E/i, "")));
      if (!e || e.status === "rejected") return text(`Entry ${id} not found.`);
      const ev = entryEvidence(e.id)
        .map((s) => `- ${s.source_type}: ${s.title}${s.occurred_at ? ` (${s.occurred_at.slice(0, 10)})` : ""}${s.quote ? `\n  > ${s.quote}` : ""}`)
        .join("\n");
      return text(`${formatEntry(e)}\n\nEvidence:\n${ev || "- none recorded"}`);
    },
  );

  if (auth.scopes.includes("write")) {
    server.registerTool(
      "report_knowledge_gap",
      {
        title: "Report a knowledge gap",
        description: "Tell the company that you needed knowledge that isn't in Company Brain. A staff member will be asked to answer it.",
        inputSchema: {
          question: z.string().min(5).describe("The precise question you could not answer"),
          context: z.string().optional().describe("What you were trying to do"),
        },
      },
      async ({ question, context }) => {
        const id = upsertQuestion({ question, context: context ?? null, origin: "agent" });
        logQuery({ channel: "mcp", apiKeyId: auth.keyId, kind: "gap", query: question, resultCount: 0, answered: false, latencyMs: 0 });
        return text(`Recorded as Q${id}. The team has been asked; proceed cautiously or escalate to a human for now.`);
      },
    );
  }

  server.registerResource(
    "operating-guide",
    "companybrain://guide",
    { title: `${company} operating guide`, description: "The full reviewed guide in Markdown", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: guideToMarkdown(buildGuide()) }] }),
  );

  return server;
}
