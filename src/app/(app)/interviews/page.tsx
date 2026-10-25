import { addQuestionAction, answerQuestionAction, dismissQuestionAction, suggestQuestionsAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Empty, Field, PageHeader, inputCls, timeAgo } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { listQuestions, listTopics } from "@/lib/store";

export const metadata = { title: "Staff Q&A" };

const ORIGIN: Record<string, { label: string; tone: "signal" | "amber" | "neutral" | "moss" }> = {
  agent: { label: "an agent asked", tone: "signal" },
  gap: { label: "unanswered question", tone: "amber" },
  ai: { label: "Claude spotted a gap", tone: "neutral" },
  manual: { label: "added by a teammate", tone: "neutral" },
};

export default async function InterviewsPage() {
  const user = await requireUser();
  const editor = can(user, "editor");
  const open = listQuestions("open");
  const answered = listQuestions("answered").slice(0, 10);
  const topics = listTopics();

  return (
    <>
      <PageHeader
        index="03"
        title="Staff Q&A"
        lede="Knowledge that never made it into Slack or email lives in people's heads. These are the questions agents couldn't answer and the gaps Claude noticed. Each answer becomes reviewed knowledge in seconds."
      />

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <section>
          <h2 className="mb-4 font-serif text-3xl">Open questions ({open.length})</h2>
          {open.length === 0 ? (
            <Empty title="Nothing to answer">When agents hit a gap, it shows up here.</Empty>
          ) : (
            <ul className="space-y-4">
              {open.map((q) => (
                <li key={q.id}>
                  <Card className="p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={ORIGIN[q.origin].tone}>{ORIGIN[q.origin].label}</Badge>
                      {q.times_asked > 1 && <Badge tone="ink">asked {q.times_asked}×</Badge>}
                      {q.topic_name && <span className="text-xs text-muted">{q.topic_name}</span>}
                      {q.assignee && <span className="text-xs text-muted">· best person: {q.assignee}</span>}
                      <span className="ml-auto font-mono text-[11px] text-muted">{timeAgo(q.created_at)}</span>
                    </div>
                    <p className="font-serif text-[22px] leading-snug text-ink">{q.question}</p>
                    {q.context && <p className="mt-1 text-sm text-muted">{q.context}</p>}
                    {editor && (
                      <>
                        <form action={answerQuestionAction} className="mt-4 space-y-2">
                          <input type="hidden" name="id" value={q.id} />
                          <textarea name="answer" rows={3} required placeholder="Your answer, as you'd explain it to a new colleague…" className={inputCls} />
                          <div className="flex items-center gap-3">
                            <SubmitButton small pending="Saving…">
                              Answer
                            </SubmitButton>
                          </div>
                        </form>
                        <form action={dismissQuestionAction} className="mt-2">
                          <input type="hidden" name="id" value={q.id} />
                          <button className="text-xs text-muted hover:text-ink">Not relevant, dismiss</button>
                        </form>
                      </>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {answered.length > 0 && (
            <>
              <h2 className="mb-3 mt-12 font-serif text-3xl">Recently answered</h2>
              <ul className="divide-y divide-rule border-y border-rule text-sm">
                {answered.map((q) => (
                  <li key={q.id} className="py-3">
                    <p className="font-medium text-ink">{q.question}</p>
                    <p className="mt-1 text-ink-2">{q.answer}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {q.answered_by} · {timeAgo(q.answered_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {editor && (
          <aside className="space-y-8">
            <Card className="p-4">
              <h3 className="mb-3 font-serif text-xl">Ask a teammate</h3>
              <form action={addQuestionAction} className="space-y-3">
                <Field label="Question">
                  <textarea name="question" rows={3} required className={inputCls} />
                </Field>
                <Field label="Who knows?">
                  <input name="assignee" placeholder="Name or team" className={inputCls} />
                </Field>
                <Field label="Topic">
                  <input name="topic" list="topic-list" className={inputCls} />
                  <datalist id="topic-list">
                    {topics.map((t) => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                </Field>
                <SubmitButton small>Add question</SubmitButton>
              </form>
            </Card>
            <div>
              <h3 className="mb-1 font-serif text-xl">Interview a topic</h3>
              <p className="mb-3 text-sm text-muted">Claude reads what’s known and drafts the questions that would fill the biggest holes.</p>
              <ul className="space-y-1.5">
                {topics.map((t) => (
                  <li key={t.id}>
                    <form action={suggestQuestionsAction} className="flex items-center justify-between gap-2 text-sm">
                      <input type="hidden" name="topicId" value={t.id} />
                      <span className="truncate text-ink-2">{t.name}</span>
                      <SubmitButton small variant="quiet" pending="…">
                        Suggest
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
