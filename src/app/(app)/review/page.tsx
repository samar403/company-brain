import Link from "next/link";
import { bulkApproveAction, resolveConflictAction, reviewEntryAction } from "@/app/actions";
import { Markdown } from "@/components/markdown";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Confidence, Empty, PageHeader, SourceIcon, TypeBadge } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { entryEvidence, getEntry, listEntries, openConflicts } from "@/lib/store";

export const metadata = { title: "Review" };

export default async function ReviewPage() {
  const user = await requireUser();
  const editor = can(user, "editor");
  const pending = listEntries({ status: "pending" });
  const conflicts = openConflicts()
    .map((c) => ({ ...c, a: getEntry(c.entry_a), b: getEntry(c.entry_b) }))
    .filter((c) => c.a && c.b);
  const highConfidence = pending.filter((e) => e.confidence >= 0.85).length;

  return (
    <>
      <PageHeader
        index="04"
        title="Review"
        lede="Claude proposes; people decide. Agents only see reviewed knowledge, so this queue is where quality is won."
        actions={
          editor &&
          highConfidence > 0 && (
            <form action={bulkApproveAction}>
              <input type="hidden" name="min" value="0.85" />
              <SubmitButton variant="ghost">Approve {highConfidence} with ≥85% confidence</SubmitButton>
            </form>
          )
        }
      />

      {conflicts.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 font-serif text-3xl">
            Conflicts <span className="text-signal">({conflicts.length})</span>
          </h2>
          <p className="mb-4 text-sm text-muted">Two sources disagree. Pick the one that’s true; the other is retired.</p>
          <div className="space-y-5">
            {conflicts.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                <p className="border-b border-rule bg-signal-soft/50 px-5 py-3 text-sm text-ink">
                  <span className="eyebrow mr-2 !text-signal">Conflict</span>
                  {c.explanation}
                </p>
                <div className="grid divide-y divide-rule md:grid-cols-2 md:divide-x md:divide-y-0">
                  {[c.a!, c.b!].map((e) => (
                    <div key={e.id} className="flex flex-col p-5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted">E{e.id}</span>
                        <Badge tone={e.status === "approved" ? "moss" : "amber"}>{e.status === "approved" ? "currently live" : "proposed"}</Badge>
                        <Confidence value={e.confidence} />
                      </div>
                      <h3 className="font-medium text-ink">{e.title}</h3>
                      <Markdown className="mt-2 flex-1 text-sm">{e.body}</Markdown>
                      {editor && (
                        <form action={resolveConflictAction} className="mt-4">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="keep" value={e.id} />
                          <SubmitButton small>Keep this one</SubmitButton>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
                {editor && (
                  <form action={resolveConflictAction} className="border-t border-rule px-5 py-2 text-right">
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-muted hover:text-ink">Both are fine, dismiss</button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-serif text-3xl">Proposed entries ({pending.length})</h2>
        {pending.length === 0 ? (
          <Empty title="Inbox zero">Everything Claude extracted has been reviewed. New sources will land here.</Empty>
        ) : (
          <div className="space-y-4">
            {pending.map((e) => {
              const evidence = entryEvidence(e.id).slice(0, 2);
              return (
                <Card key={e.id} className="grid gap-5 p-5 md:grid-cols-[1fr_260px]">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <TypeBadge type={e.type} />
                      {e.topic_name && <span className="text-xs text-muted">{e.topic_name}</span>}
                      <Confidence value={e.confidence} />
                    </div>
                    <Link href={`/knowledge/${e.id}`} className="font-medium text-ink hover:underline">
                      {e.title}
                    </Link>
                    <Markdown className="mt-2 text-sm">{e.body}</Markdown>
                    {editor && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <form action={reviewEntryAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="status" value="approved" />
                          <SubmitButton small>Approve</SubmitButton>
                        </form>
                        <Link href={`/knowledge/${e.id}?edit=1`} className="inline-flex items-center rounded-full border border-rule-strong px-3 py-1 text-[13px] hover:border-ink">
                          Edit
                        </Link>
                        <form action={reviewEntryAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="status" value="rejected" />
                          <SubmitButton small variant="danger">
                            Reject
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </div>
                  <aside className="space-y-2 border-t border-rule pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                    <p className="eyebrow">Evidence</p>
                    {evidence.map((ev) => (
                      <Link key={ev.document_id} href={`/library/${ev.document_id}`} className="block text-xs hover:opacity-80">
                        <span className="flex items-center gap-2 text-ink-2">
                          <SourceIcon type={ev.source_type} className="h-5 w-5 text-[8px]" />
                          <span className="truncate">{ev.title}</span>
                        </span>
                        {ev.quote && <q className="mt-1 block italic text-muted">{ev.quote}</q>}
                      </Link>
                    ))}
                    {!evidence.length && <p className="text-xs text-muted">Written by a person.</p>}
                  </aside>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
