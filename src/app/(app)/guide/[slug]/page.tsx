import Link from "next/link";
import { notFound } from "next/navigation";
import { compileGuideAction, suggestQuestionsAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Markdown } from "@/components/markdown";
import { Confidence, Empty, TypeBadge, timeAgo } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { buildGuide } from "@/lib/guide";
import { getTopicBySlug } from "@/lib/store";

export default async function ChapterPage({ params }: PageProps<"/guide/[slug]">) {
  const user = await requireUser();
  const { slug } = await params;
  const topic = getTopicBySlug(slug);
  if (!topic) notFound();
  const chapter = buildGuide({ topic: slug }).chapters[0];

  return (
    <article>
      <nav className="mb-6 text-sm text-muted">
        <Link href="/guide" className="hover:text-ink">
          The Guide
        </Link>{" "}
        / {topic.name}
      </nav>
      <header className="mb-8 border-b-2 border-ink pb-5">
        <p className="eyebrow">Chapter</p>
        <h1 className="mt-1 font-serif text-[48px] leading-none md:text-[64px]">{topic.name}</h1>
        {topic.description && <p className="mt-3 max-w-2xl text-ink-2">{topic.description}</p>}
        {can(user, "editor") && (
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={compileGuideAction}>
              <input type="hidden" name="topicId" value={topic.id} />
              <input type="hidden" name="returnTo" value={`/guide/${slug}`} />
              <SubmitButton small variant="ghost" pending="Rewriting…">
                Rewrite this chapter
              </SubmitButton>
            </form>
            <form action={suggestQuestionsAction}>
              <input type="hidden" name="topicId" value={topic.id} />
              <SubmitButton small variant="ghost" pending="Thinking…">
                Find gaps to ask staff about
              </SubmitButton>
            </form>
          </div>
        )}
      </header>

      {!chapter ? (
        <Empty title="No reviewed knowledge in this chapter yet" />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
          <div>
            <p className="eyebrow mb-2">Briefing{topic.summary_updated_at && ` · written ${timeAgo(topic.summary_updated_at)}`}</p>
            {chapter.briefing ? <Markdown className="text-[16px]">{chapter.briefing}</Markdown> : <p className="text-muted">Not written yet. Use “Rewrite this chapter”.</p>}
          </div>
          <aside>
            <p className="eyebrow mb-3">Reference entries ({chapter.entries.length})</p>
            <ul className="space-y-2">
              {chapter.entries.map((e) => (
                <li key={e.id}>
                  <Link href={`/knowledge/${e.id}`} className="block rounded-lg border border-rule bg-surface p-3 hover:border-ink">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted">E{e.id}</span>
                      <TypeBadge type={e.type} />
                    </span>
                    <span className="mt-1 block text-sm font-medium text-ink">{e.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <Confidence value={e.confidence} />
                      {e.owner && <span className="truncate">· {e.owner}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </article>
  );
}
