import Link from "next/link";
import { loadDemoAction, runPipelineAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, timeAgo } from "@/components/ui";
import { aiEnabled } from "@/lib/ai/claude";
import { can, requireUser } from "@/lib/auth";
import { listQuestions, listSources, listTopics, recentActivity, stats } from "@/lib/store";

export const metadata = { title: "Overview" };

export default async function Dashboard() {
  const user = await requireUser();
  const s = stats();
  const topics = listTopics();
  const sources = listSources();
  const activity = recentActivity(10);
  const gaps = listQuestions("open").slice(0, 5);
  const coverageMax = Math.max(1, ...topics.map((t) => t.approved_count));
  const empty = s.documents === 0 && s.approved === 0;

  return (
    <>
      <PageHeader
        index="01"
        title={
          <>
            What the company <em className="text-signal">knows</em>
          </>
        }
        lede="Every Slack thread, email and staff answer that comes in is read, distilled into reviewed knowledge, and published as a guide your AI agents can follow."
        actions={
          can(user, "editor") && (
            <form action={runPipelineAction}>
              <input type="hidden" name="returnTo" value="/dashboard" />
              <SubmitButton variant="signal" pending="Reading sources…">
                Run pipeline{s.unprocessed ? ` (${s.unprocessed} new)` : ""}
              </SubmitButton>
            </form>
          )
        }
      />

      {empty ? (
        <Empty
          title="Your brain is empty"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {can(user, "admin") && (
                <form action={loadDemoAction}>
                  <SubmitButton variant="ghost">Load the demo company</SubmitButton>
                </form>
              )}
              <LinkButton href="/sources">Connect a source</LinkButton>
            </div>
          }
        >
          Connect Slack or email, upload documents, or answer a few questions. Company Brain turns them into knowledge
          entries you review before agents can use them.
        </Empty>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-y-6 py-5 md:grid-cols-4">
            <Stat label="Reviewed entries" value={s.approved} hint={`${s.topics} topics`} href="/knowledge" />
            <Stat label="Waiting for review" value={s.pending + s.conflicts} hint={`${s.conflicts} conflicts`} href="/review" />
            <Stat label="Agent queries · 7d" value={s.agentQueries7d} hint={`${s.unanswered7d} unanswered`} href="/agents" />
            <Stat label="Raw documents" value={s.documents} hint={`${s.unprocessed} not yet read`} href="/library" />
          </Card>

          {!aiEnabled() && (
            <p className="mt-4 rounded-lg border border-amber/30 bg-amber-soft px-4 py-2.5 text-sm text-amber">
              Running in offline mode: extraction and answers use simple heuristics. Set <code>ANTHROPIC_API_KEY</code> to
              let Claude read sources, merge duplicates, spot conflicts and write the guide.
            </p>
          )}

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-serif text-3xl">Coverage by topic</h2>
                <Link href="/guide" className="text-sm text-muted hover:text-ink">
                  Open the guide →
                </Link>
              </div>
              <ul className="divide-y divide-rule border-y border-rule">
                {topics.map((t) => (
                  <li key={t.id}>
                    <Link href={`/guide/${t.slug}`} className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 hover:bg-sunken/40">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{t.name}</p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full rounded-full bg-ink" style={{ width: `${(t.approved_count / coverageMax) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 font-mono text-xs text-muted">
                        {t.pending_count > 0 && <Badge tone="amber">{t.pending_count} to review</Badge>}
                        <span className="w-20 whitespace-nowrap text-right">
                          {t.approved_count} {t.approved_count === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-10">
              <div>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-serif text-3xl">Knowledge gaps</h2>
                  <Link href="/interviews" className="text-sm text-muted hover:text-ink">
                    Answer →
                  </Link>
                </div>
                {gaps.length ? (
                  <ul className="space-y-2">
                    {gaps.map((q) => (
                      <li key={q.id} className="rounded-lg border border-rule bg-surface px-3 py-2.5 text-sm">
                        <p className="text-ink">{q.question}</p>
                        <p className="mt-1 font-mono text-[11px] text-muted">
                          {q.origin === "agent" ? "asked by an agent" : q.origin === "gap" ? "unanswered question" : "suggested by Claude"}
                          {q.times_asked > 1 && ` · asked ${q.times_asked}×`}
                          {q.assignee && ` · ask ${q.assignee}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No open gaps. Agents found what they needed.</p>
                )}
              </div>

              <div>
                <h2 className="mb-3 font-serif text-3xl">Sources</h2>
                <ul className="space-y-1.5 text-sm">
                  {sources.map((src) => (
                    <li key={src.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{src.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">
                        {src.doc_count} docs · {timeAgo(src.last_synced_at ?? src.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <section className="mt-12">
            <h2 className="mb-3 font-serif text-3xl">Recent activity</h2>
            <ol className="relative space-y-3 border-l border-rule pl-5">
              {activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="absolute -left-[3px] mt-2 h-1.5 w-1.5 rounded-full bg-signal" />
                  <span className="font-medium text-ink">{a.actor}</span> <span className="text-ink-2">{a.action}</span>
                  {a.detail && <span className="text-muted"> · {a.detail}</span>}
                  <span className="ml-2 font-mono text-[11px] text-muted">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
