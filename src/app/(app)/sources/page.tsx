import { headers } from "next/headers";
import { addNoteAction, deleteSourceAction, loadDemoAction, runPipelineAction, syncSlackAction, uploadAction } from "@/app/actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, Card, Field, PageHeader, SourceIcon, inputCls, timeAgo } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { demoLoaded } from "@/lib/demo";
import { listSources, stats } from "@/lib/store";

export const metadata = { title: "Sources" };

export default async function SourcesPage() {
  const user = await requireUser();
  const sources = listSources();
  const s = stats();
  const host = (await headers()).get("host") ?? "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const editor = can(user, "editor");
  const slackEnv = Boolean(process.env.SLACK_BOT_TOKEN);

  return (
    <>
      <PageHeader
        index="02"
        title="Sources"
        lede="Where knowledge comes from. Everything is de-duplicated, stripped of secrets (tokens, passwords, card numbers), and queued for Claude to read."
        actions={
          editor && (
            <form action={runPipelineAction}>
              <input type="hidden" name="returnTo" value="/sources" />
              <SubmitButton variant="signal" pending="Reading…" disabled={!s.unprocessed}>
                Extract knowledge ({s.unprocessed} waiting)
              </SubmitButton>
            </form>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Slack */}
        <Card className="p-5">
          <ConnectorHead type="slack" title="Slack" sub="Threads from the channels your bot is invited to" />
          <form action={syncSlackAction} className="mt-4 space-y-3">
            {!slackEnv && (
              <Field label="Bot token" hint="Scopes: channels:history, channels:read, users:read. Or set SLACK_BOT_TOKEN on the server.">
                <input name="token" type="password" placeholder="xoxb-…" className={inputCls} autoComplete="off" />
              </Field>
            )}
            <Field label="Channels" hint="Leave empty to read every channel the bot is a member of.">
              <input name="channels" placeholder="#support, #eng, #sales" className={inputCls} />
            </Field>
            <SubmitButton disabled={!editor} pending="Syncing…">
              {slackEnv ? "Sync Slack now" : "Connect & sync"}
            </SubmitButton>
          </form>
          <details className="mt-4 text-sm text-muted">
            <summary className="cursor-pointer text-ink-2">Real-time capture with the Events API</summary>
            <p className="mt-2">
              Set the Event Subscriptions request URL to the address below, subscribe to <code>message.channels</code>, and
              set <code>SLACK_SIGNING_SECRET</code>.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="truncate rounded bg-sunken px-2 py-1 font-mono text-xs">{origin}/api/webhooks/slack</code>
              <CopyButton value={`${origin}/api/webhooks/slack`} />
            </div>
          </details>
        </Card>

        {/* Email */}
        <Card className="p-5">
          <ConnectorHead type="email" title="Email" sub="A shared inbox, forwarded rules, or an archive" />
          <ol className="mt-4 space-y-3 text-sm text-ink-2">
            <li>
              <span className="font-medium text-ink">Forward live mail.</span> Point Postmark, SendGrid Inbound Parse,
              Mailgun or a Gmail forwarding rule (via Zapier) at:
              <div className="mt-2 flex items-center gap-2">
                <code className="truncate rounded bg-sunken px-2 py-1 font-mono text-xs">
                  {origin}/api/webhooks/email?secret=…
                </code>
                <CopyButton value={`${origin}/api/webhooks/email?secret=YOUR_EMAIL_WEBHOOK_SECRET`} />
              </div>
              {!process.env.EMAIL_WEBHOOK_SECRET && (
                <p className="mt-1 text-xs text-amber">Set EMAIL_WEBHOOK_SECRET on the server to enable it.</p>
              )}
            </li>
            <li>
              <span className="font-medium text-ink">Import history.</span> Upload <code>.mbox</code> (Gmail Takeout,
              Apple Mail, Thunderbird) or <code>.eml</code> files below.
            </li>
          </ol>
        </Card>

        {/* Upload */}
        <Card className="p-5">
          <ConnectorHead type="upload" title="Upload files" sub="Docs, wikis, exports and archives" />
          <form action={uploadAction} className="mt-4 space-y-3">
            <input
              type="file"
              name="files"
              multiple
              accept=".md,.markdown,.txt,.csv,.json,.html,.htm,.eml,.mbox,.zip"
              className="block w-full rounded-lg border border-dashed border-rule-strong bg-sunken/40 p-4 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1 file:text-paper"
            />
            <p className="text-xs text-muted">
              Markdown, text, CSV, JSON, HTML, .eml, .mbox, or a Slack export .zip. Up to 25 MB per upload.
            </p>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name="process" defaultChecked className="accent-[var(--signal)]" /> Extract knowledge right away
            </label>
            <SubmitButton disabled={!editor} pending="Importing…">
              Import
            </SubmitButton>
          </form>
        </Card>

        {/* Staff */}
        <Card className="p-5">
          <ConnectorHead type="staff" title="Staff brain-dump" sub="Write down what only you know. It's trusted as human knowledge." />
          <form action={addNoteAction} className="mt-4 space-y-3">
            <input name="title" placeholder="Topic, e.g. How we handle enterprise trials" className={inputCls} />
            <textarea
              name="content"
              rows={5}
              required
              placeholder="Explain it like you would to a new colleague: the rule, the exceptions, who to ask…"
              className={inputCls}
            />
            <SubmitButton disabled={!editor} pending="Saving…">
              Save to the brain
            </SubmitButton>
          </form>
        </Card>
      </div>

      <section className="mt-12">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-3xl">Connected sources</h2>
          {can(user, "admin") && !demoLoaded() && (
            <form action={loadDemoAction}>
              <SubmitButton variant="ghost" small pending="Loading…">
                Load demo company
              </SubmitButton>
            </form>
          )}
        </div>
        {sources.length ? (
          <div className="overflow-x-auto rounded-xl border border-rule">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-sunken/60 text-left">
                <tr className="eyebrow">
                  <th className="px-4 py-2 font-normal">Source</th>
                  <th className="px-4 py-2 font-normal">Documents</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Last sync</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-rule bg-surface">
                {sources.map((src) => (
                  <tr key={src.id}>
                    <td className="px-4 py-3">
                      <a href={`/library?source=${src.id}`} className="flex items-center gap-3 hover:underline">
                        <SourceIcon type={src.type} />
                        {src.name}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {src.doc_count}
                      {src.pending_count > 0 && <span className="text-amber"> · {src.pending_count} unread</span>}
                    </td>
                    <td className="px-4 py-3">
                      {src.status === "error" ? (
                        <span title={src.last_error ?? ""}>
                          <Badge tone="signal">error</Badge>
                        </span>
                      ) : (
                        <Badge tone={src.status === "syncing" ? "amber" : "moss"}>{src.status === "idle" ? "ok" : src.status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{timeAgo(src.last_synced_at ?? src.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {can(user, "admin") && (
                        <form action={deleteSourceAction}>
                          <input type="hidden" name="id" value={src.id} />
                          <button className="text-xs text-muted hover:text-signal">Remove</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Nothing connected yet.</p>
        )}
      </section>
    </>
  );
}

function ConnectorHead({ type, title, sub }: { type: string; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <SourceIcon type={type} className="h-9 w-9 text-[11px]" />
      <div>
        <h2 className="font-serif text-2xl leading-none">{title}</h2>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
    </div>
  );
}
