import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEntryAction, reviewEntryAction } from "@/app/actions";
import { Markdown } from "@/components/markdown";
import { SubmitButton } from "@/components/client";
import { Card, Confidence, LinkButton, SourceIcon, StatusBadge, TypeBadge, timeAgo } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { entryEvidence, getEntry, listTopics } from "@/lib/store";
import { EntryEditor } from "../editor";

export default async function EntryPage({ params, searchParams }: PageProps<"/knowledge/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const editing = (await searchParams).edit === "1";
  const entry = getEntry(Number(id));
  if (!entry) notFound();
  const evidence = entryEvidence(entry.id);
  const editor = can(user, "editor");
  const conflicts = all<{ id: number; other: number; explanation: string }>(
    `SELECT id, CASE WHEN entry_a = ? THEN entry_b ELSE entry_a END other, explanation
     FROM conflicts WHERE status = 'open' AND (entry_a = ? OR entry_b = ?)`,
    entry.id,
    entry.id,
    entry.id,
  );

  return (
    <article>
      <nav className="mb-6 text-sm text-muted">
        <Link href="/knowledge" className="hover:text-ink">
          Knowledge
        </Link>
        {entry.topic_slug && (
          <>
            {" / "}
            <Link href={`/guide/${entry.topic_slug}`} className="hover:text-ink">
              {entry.topic_name}
            </Link>
          </>
        )}
      </nav>

      <header className="mb-8 border-b border-rule pb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted">E{entry.id}</span>
          <TypeBadge type={entry.type} />
          <StatusBadge status={entry.status} />
          <Confidence value={entry.confidence} />
          <span className="text-xs text-muted">
            {entry.origin === "human" ? "written by a person" : "extracted by Claude"} · updated {timeAgo(entry.updated_at)}
          </span>
        </div>
        <h1 className="font-serif text-[40px] leading-[1.05] text-ink md:text-[52px]">{entry.title}</h1>
        {entry.owner && (
          <p className="mt-3 text-sm text-ink-2">
            Owner: <span className="marker">{entry.owner}</span>
          </p>
        )}
      </header>

      {conflicts.map((c) => (
        <p key={c.id} className="mb-6 rounded-lg border border-signal/30 bg-signal-soft px-4 py-3 text-sm text-signal">
          Conflicts with{" "}
          <Link href={`/knowledge/${c.other}`} className="underline">
            E{c.other}
          </Link>
          : {c.explanation}{" "}
          <Link href="/review" className="font-medium underline">
            Resolve
          </Link>
        </p>
      ))}

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          {editing && editor ? (
            <EntryEditor entry={entry} topics={listTopics().map((t) => t.name)} topicName={entry.topic_name} />
          ) : (
            <>
              <Markdown className="text-[16px]">{entry.body}</Markdown>
              {editor && (
                <div className="mt-8 flex flex-wrap gap-2 border-t border-rule pt-5">
                  {entry.status !== "approved" && (
                    <form action={reviewEntryAction}>
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="status" value="approved" />
                      <SubmitButton small>Approve</SubmitButton>
                    </form>
                  )}
                  <LinkButton href={`/knowledge/${entry.id}?edit=1`} variant="ghost" small>
                    Edit
                  </LinkButton>
                  {entry.status === "approved" && (
                    <form action={reviewEntryAction}>
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="status" value="stale" />
                      <SubmitButton small variant="ghost">
                        Mark outdated
                      </SubmitButton>
                    </form>
                  )}
                  {entry.status !== "rejected" && (
                    <form action={reviewEntryAction}>
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <SubmitButton small variant="danger">
                        Reject
                      </SubmitButton>
                    </form>
                  )}
                  {can(user, "admin") && (
                    <form action={deleteEntryAction} className="ml-auto">
                      <input type="hidden" name="id" value={entry.id} />
                      <button className="text-xs text-muted hover:text-signal">Delete permanently</button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <aside>
          <p className="eyebrow mb-3">Evidence ({evidence.length})</p>
          <div className="space-y-3">
            {evidence.map((ev) => (
              <Card key={ev.document_id} className="p-3">
                <Link href={`/library/${ev.document_id}`} className="flex items-start gap-2 text-sm hover:underline">
                  <SourceIcon type={ev.source_type} className="mt-0.5 h-5 w-5 text-[8px]" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-ink">{ev.title}</span>
                    <span className="block font-mono text-[10.5px] text-muted">
                      {[ev.author, ev.occurred_at?.slice(0, 10)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
                {ev.quote && <blockquote className="mt-2 border-l-2 border-signal pl-2 text-xs italic text-ink-2">{ev.quote}</blockquote>}
              </Card>
            ))}
            {!evidence.length && <p className="text-sm text-muted">Written directly by a teammate.</p>}
          </div>
        </aside>
      </div>
    </article>
  );
}
