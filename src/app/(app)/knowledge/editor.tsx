import { saveEntryAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Field, inputCls } from "@/components/ui";
import { ENTRY_TYPES, ENTRY_TYPE_LABEL, type Entry } from "@/lib/types";

export function EntryEditor({ entry, topics, topicName }: { entry?: Entry; topics: string[]; topicName?: string | null }) {
  return (
    <form action={saveEntryAction} className="space-y-4">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <Field label="Title" hint="A short phrase or question an agent would search for.">
        <input name="title" required defaultValue={entry?.title} className={inputCls} />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Type">
          <select name="type" defaultValue={entry?.type ?? "fact"} className={inputCls}>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Topic">
          <input name="topic" list="topics" defaultValue={topicName ?? ""} placeholder="General" className={inputCls} />
          <datalist id="topics">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Owner">
          <input name="owner" defaultValue={entry?.owner ?? ""} placeholder="Person or team" className={inputCls} />
        </Field>
      </div>
      <Field label="Body (Markdown)" hint="Write it as instructions an agent can follow: rules, numbers, steps, exceptions.">
        <textarea name="body" required rows={12} defaultValue={entry?.body} className={`${inputCls} font-mono text-[13px]`} />
      </Field>
      <SubmitButton pending="Saving…">{entry ? "Save & mark reviewed" : "Publish entry"}</SubmitButton>
    </form>
  );
}
