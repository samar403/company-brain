"use client";

import { useActionState } from "react";
import { createKeyAction, type KeyState } from "@/app/actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { inputCls } from "@/components/ui";

export function KeyForm() {
  const [state, action] = useActionState<KeyState | null, FormData>(createKeyAction, null);
  return (
    <div>
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input name="name" placeholder="e.g. Support bot, Claude Code, Sales assistant" className={inputCls} aria-label="Key name" required />
        <label className="flex shrink-0 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="write" defaultChecked className="accent-[var(--signal)]" /> can report gaps
        </label>
        <SubmitButton className="shrink-0">Create key</SubmitButton>
      </form>
      {state?.error && <p className="mt-2 text-sm text-signal">{state.error}</p>}
      {state?.secret && (
        <div className="mt-3 rounded-lg border border-moss/40 bg-moss-soft p-3 text-sm">
          <p className="font-medium text-moss">Copy this key now. It won’t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-xs text-ink">{state.secret}</code>
            <CopyButton value={state.secret} />
          </div>
        </div>
      )}
    </div>
  );
}
