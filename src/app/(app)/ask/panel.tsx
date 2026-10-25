"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { askAction, type AskState } from "@/app/actions";
import { Dots, SubmitButton } from "@/components/client";
import { Markdown } from "@/components/markdown";
import { Badge, Card, Confidence } from "@/components/ui";

export function AskPanel({ examples }: { examples: string[] }) {
  const [state, action, pending] = useActionState<AskState | null, FormData>(askAction, null);
  const input = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <form action={action} className="relative">
        <textarea
          ref={input}
          name="question"
          rows={3}
          defaultValue={state?.question}
          placeholder="Ask anything an agent or new hire would need to know…"
          className="w-full resize-none rounded-2xl border border-rule-strong bg-surface px-5 py-4 pr-32 font-serif text-[24px] leading-snug text-ink placeholder:text-muted/60 focus:border-ink focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          aria-label="Question"
        />
        <div className="absolute bottom-4 right-4">
          <SubmitButton variant="signal" pending="Asking">
            Ask
          </SubmitButton>
        </div>
      </form>

      {!state && !pending && (
        <div className="mt-4 flex flex-wrap gap-2">
          {examples.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                if (input.current) {
                  input.current.value = q;
                  input.current.form?.requestSubmit();
                }
              }}
              className="rounded-full border border-rule-strong px-3 py-1.5 text-sm text-ink-2 hover:border-ink hover:text-ink"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <p className="mt-8 flex items-center gap-2 text-muted">
          <Dots /> Searching the knowledge base and writing an answer…
        </p>
      )}

      {state?.error && !pending && <p className="mt-6 rounded-lg bg-signal-soft px-4 py-3 text-sm text-signal">{state.error}</p>}

      {state?.answer && !pending && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {state.answerable ? <Badge tone="moss">Answered from the brain</Badge> : <Badge tone="amber">Gap recorded for staff</Badge>}
              {state.confidence !== undefined && <Confidence value={state.confidence} />}
              <span className="font-mono text-[11px] text-muted">
                {state.mode === "claude" ? "Claude" : "offline"} · {state.latency} ms
              </span>
            </div>
            <Markdown className="text-[16px]">{state.answer}</Markdown>
          </Card>
          <aside>
            <p className="eyebrow mb-3">Cited ({state.citations?.length ?? 0})</p>
            <ul className="space-y-2">
              {state.citations?.map((c) => (
                <li key={c.id}>
                  <Link href={`/knowledge/${c.id}`} className="block rounded-lg border border-rule bg-surface p-3 text-sm hover:border-ink">
                    <span className="font-mono text-[11px] text-muted">E{c.id}</span>
                    {c.status !== "approved" && <span className="ml-2 text-[11px] text-amber">not reviewed</span>}
                    <span className="block text-ink">{c.title}</span>
                    {c.topic && <span className="text-xs text-muted">{c.topic}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {!state.answerable && (
              <p className="mt-4 text-sm text-muted">
                This question was added to <Link href="/interviews" className="underline">Staff Q&amp;A</Link>. Once someone answers it,
                agents will know too.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
