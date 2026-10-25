import Link from "next/link";
import { compileGuideAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Markdown } from "@/components/markdown";
import { Empty, PageHeader, btn, timeAgo } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { buildGuide } from "@/lib/guide";
import { listTopics } from "@/lib/store";

export const metadata = { title: "The Guide" };

export default async function GuidePage() {
  const user = await requireUser();
  const guide = buildGuide();
  const topics = listTopics();
  const total = guide.chapters.reduce((n, c) => n + c.entries.length, 0);
  const updated = topics.map((t) => t.summary_updated_at).filter(Boolean).sort().at(-1);

  return (
    <>
      <PageHeader
        index="07"
        title={
          <>
            The <em>{guide.company}</em> Guide
          </>
        }
        lede={`What every AI agent should know before acting for ${guide.company}. ${total} reviewed entries in ${guide.chapters.length} chapters${updated ? `, last rewritten ${timeAgo(updated)}` : ""}.`}
        actions={
          <>
            <a href="/export/guide?format=md" className={btn("ghost", true)}>
              Download AGENTS.md
            </a>
            <a href="/export/guide?format=json" className={btn("ghost", true)}>
              JSON
            </a>
            {can(user, "editor") && (
              <form action={compileGuideAction}>
                <input type="hidden" name="returnTo" value="/guide" />
                <SubmitButton small pending="Rewriting…">
                  Refresh changed chapters
                </SubmitButton>
              </form>
            )}
          </>
        }
      />

      {guide.chapters.length === 0 ? (
        <Empty title="No chapters yet">Approve some knowledge in Review and the guide writes itself.</Empty>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          <nav className="lg:sticky lg:top-10 lg:self-start" aria-label="Chapters">
            <p className="eyebrow mb-3">Contents</p>
            <ol className="space-y-1.5 text-sm">
              {guide.chapters.map((c, i) => (
                <li key={c.slug}>
                  <a href={`#${c.slug}`} className="flex gap-2 text-ink-2 hover:text-signal">
                    <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                    {c.name}
                  </a>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-lg border border-rule p-3 text-xs text-muted">
              <p className="mb-1 font-medium text-ink">Agent preamble</p>
              {guide.instructions.split("\n")[0]} Served at <code>/api/v1/guide</code> and MCP.
            </div>
          </nav>

          <div className="min-w-0 space-y-16">
            {guide.chapters.map((c, i) => (
              <section key={c.slug} id={c.slug} className="scroll-mt-8">
                <div className="mb-4 flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
                  <h2 className="font-serif text-[36px] leading-none">
                    <span className="mr-3 font-mono text-sm text-signal">{String(i + 1).padStart(2, "0")}</span>
                    {c.name}
                  </h2>
                  <Link href={`/guide/${c.slug}`} className="shrink-0 text-sm text-muted hover:text-ink">
                    {c.entries.length} {c.entries.length === 1 ? "entry" : "entries"} →
                  </Link>
                </div>
                {c.briefing ? (
                  <Markdown>{c.briefing}</Markdown>
                ) : (
                  <ul className="prose-brain">
                    {c.entries.map((e) => (
                      <li key={e.id}>
                        <Link href={`/knowledge/${e.id}`}>{e.title}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
