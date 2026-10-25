import { headers } from "next/headers";
import { revokeKeyAction } from "@/app/actions";
import { CopyButton } from "@/components/client";
import { Badge, Card, PageHeader, timeAgo } from "@/components/ui";
import { can, listApiKeys, requireUser } from "@/lib/auth";
import { recentQueries } from "@/lib/store";
import { KeyForm } from "./key-form";

export const metadata = { title: "Agents & API" };

export default async function AgentsPage() {
  const user = await requireUser();
  const admin = can(user, "admin");
  const keys = listApiKeys();
  const queries = recentQueries(25);
  const host = (await headers()).get("host") ?? "localhost:3000";
  const origin = `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;

  const snippets: { title: string; note: string; code: string }[] = [
    {
      title: "Claude Code",
      note: "Adds Company Brain as a remote MCP server for every session in this project.",
      code: `claude mcp add --transport http company-brain ${origin}/api/mcp \\\n  --header "Authorization: Bearer $COMPANY_BRAIN_KEY"`,
    },
    {
      title: "Claude API (MCP connector)",
      note: "Give any agent you build on the Claude API the brain as tools.",
      code: `const response = await client.beta.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  betas: ["mcp-client-2025-11-20"],
  mcp_servers: [{
    type: "url",
    name: "company-brain",
    url: "${origin}/api/mcp",
    authorization_token: process.env.COMPANY_BRAIN_KEY,
  }],
  tools: [{ type: "mcp_toolset", mcp_server_name: "company-brain" }],
  messages: [{ role: "user", content: "A customer wants a refund after 3 weeks. What should I do?" }],
});`,
    },
    {
      title: "Claude Desktop / any stdio client",
      note: "Bridges the remote server through mcp-remote.",
      code: `{
  "mcpServers": {
    "company-brain": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${origin}/api/mcp",
               "--header", "Authorization:Bearer \${COMPANY_BRAIN_KEY}"],
      "env": { "COMPANY_BRAIN_KEY": "cb_live_..." }
    }
  }
}`,
    },
    {
      title: "REST",
      note: "Search, ask, fetch the guide, report gaps. JSON in, JSON out.",
      code: `curl -s "${origin}/api/v1/search?q=refund+policy" -H "Authorization: Bearer $COMPANY_BRAIN_KEY"

curl -s ${origin}/api/v1/ask -H "Authorization: Bearer $COMPANY_BRAIN_KEY" \\
  -H "content-type: application/json" -d '{"question":"Can I discount a monthly plan?"}'

curl -s "${origin}/api/v1/guide?format=md" -H "Authorization: Bearer $COMPANY_BRAIN_KEY" > AGENTS.md`,
    },
  ];

  return (
    <>
      <PageHeader
        index="09"
        title="Agents & API"
        lede="Connect any agent to the brain. Every agent gets its own key, so you can see what it asks and cut it off any time."
      />

      <section className="mb-12">
        <h2 className="mb-3 font-serif text-3xl">API keys</h2>
        {admin && (
          <Card className="mb-4 p-4">
            <KeyForm />
          </Card>
        )}
        <ul className="divide-y divide-rule border-y border-rule text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="font-medium text-ink">{k.name}</span>
              <code className="font-mono text-xs text-muted">{k.prefix}…</code>
              {(JSON.parse(k.scopes) as string[]).map((s) => (
                <Badge key={s}>{s}</Badge>
              ))}
              {k.revoked_at && <Badge tone="signal">revoked</Badge>}
              <span className="ml-auto font-mono text-[11px] text-muted">
                created {timeAgo(k.created_at)} · used {timeAgo(k.last_used_at)}
              </span>
              {admin && !k.revoked_at && (
                <form action={revokeKeyAction}>
                  <input type="hidden" name="id" value={k.id} />
                  <button className="text-xs text-muted hover:text-signal">Revoke</button>
                </form>
              )}
            </li>
          ))}
          {!keys.length && <li className="py-3 text-muted">No keys yet.</li>}
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-1 font-serif text-3xl">Connect an agent</h2>
        <p className="mb-4 text-sm text-muted">
          MCP tools: <code>search_knowledge</code>, <code>ask_company_brain</code>, <code>get_guide</code>, <code>list_topics</code>,{" "}
          <code>get_entry</code>, <code>report_knowledge_gap</code>, plus the resource <code>companybrain://guide</code>.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {snippets.map((s) => (
            <Card key={s.title} className="flex min-w-0 flex-col self-start p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium text-ink">{s.title}</h3>
                  <p className="text-xs text-muted">{s.note}</p>
                </div>
                <CopyButton value={s.code} />
              </div>
              <pre className="overflow-x-auto rounded-lg bg-sunken p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{s.code}</pre>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-3xl">What agents asked</h2>
        {queries.length ? (
          <div className="overflow-x-auto rounded-xl border border-rule">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-sunken/60 text-left">
                <tr className="eyebrow">
                  <th className="px-4 py-2 font-normal">When</th>
                  <th className="px-4 py-2 font-normal">Who</th>
                  <th className="px-4 py-2 font-normal">Call</th>
                  <th className="px-4 py-2 font-normal">Query</th>
                  <th className="px-4 py-2 font-normal">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule bg-surface">
                {queries.map((q) => (
                  <tr key={q.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-muted">{timeAgo(q.created_at)}</td>
                    <td className="px-4 py-2.5">{q.key_name ?? (q.channel === "ui" ? "teammate" : "—")}</td>
                    <td className="px-4 py-2.5">
                      <Badge>
                        {q.channel}·{q.kind}
                      </Badge>
                    </td>
                    <td className="max-w-[340px] truncate px-4 py-2.5 text-ink-2" title={q.query}>
                      {q.query}
                    </td>
                    <td className="px-4 py-2.5">
                      {q.answered ? <Badge tone="moss">{q.result_count} hits</Badge> : <Badge tone="amber">gap</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No agent traffic yet.</p>
        )}
      </section>
    </>
  );
}
