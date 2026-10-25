import { addUserAction, removeUserAction, saveSettingsAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Field, PageHeader, inputCls } from "@/components/ui";
import { aiEnabled, MODEL } from "@/lib/ai/claude";
import { can, listUsers, requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/db";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = can(user, "admin");
  const threshold = getSetting("auto_approve_threshold", "1.1");
  const users = listUsers();
  const env = [
    ["ANTHROPIC_API_KEY", aiEnabled(), aiEnabled() ? `Claude connected (${MODEL})` : "Offline heuristics in use"],
    ["SLACK_BOT_TOKEN", Boolean(process.env.SLACK_BOT_TOKEN), "Slack sync without pasting a token"],
    ["SLACK_SIGNING_SECRET", Boolean(process.env.SLACK_SIGNING_SECRET), "Real-time Slack events"],
    ["EMAIL_WEBHOOK_SECRET", Boolean(process.env.EMAIL_WEBHOOK_SECRET), "Inbound email webhook"],
  ] as const;

  return (
    <>
      <PageHeader index="10" title="Settings" lede="Workspace, review policy, teammates and integrations." />
      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-serif text-2xl">Workspace</h2>
          <form action={saveSettingsAction} className="space-y-4">
            <Field label="Company name" hint="Used in the guide and in every prompt sent to Claude.">
              <input name="company" defaultValue={getSetting("company_name", "")} className={inputCls} disabled={!admin} />
            </Field>
            <Field label="Auto-approve" hint="Entries Claude is at least this sure about skip the review queue. Staff answers are always approved.">
              <select name="auto_approve" defaultValue={threshold === "1.1" ? "off" : threshold} className={inputCls} disabled={!admin}>
                <option value="off">Never, a person reviews everything</option>
                <option value="0.95">95% confidence and up</option>
                <option value="0.9">90% confidence and up</option>
                <option value="0.8">80% confidence and up</option>
              </select>
            </Field>
            {admin && <SubmitButton>Save</SubmitButton>}
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-serif text-2xl">Integrations</h2>
          <ul className="space-y-3 text-sm">
            {env.map(([name, on, note]) => (
              <li key={name} className="flex items-start justify-between gap-3">
                <span>
                  <code className="font-mono text-xs">{name}</code>
                  <span className="block text-xs text-muted">{note}</span>
                </span>
                <Badge tone={on ? "moss" : "neutral"}>{on ? "set" : "not set"}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Set these as environment variables on the server (see .env.example) and restart.</p>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-serif text-2xl">Team</h2>
          <ul className="mb-6 divide-y divide-rule border-y border-rule text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                <span className="font-medium text-ink">{u.name}</span>
                <span className="text-muted">{u.email}</span>
                <Badge tone={u.role === "admin" ? "ink" : "neutral"}>{u.role}</Badge>
                {admin && u.id !== user.id && (
                  <form action={removeUserAction} className="ml-auto">
                    <input type="hidden" name="id" value={u.id} />
                    <button className="text-xs text-muted hover:text-signal">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {admin && (
            <form action={addUserAction} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_140px_auto] md:items-end">
              <Field label="Name">
                <input name="name" className={inputCls} />
              </Field>
              <Field label="Email">
                <input name="email" type="email" required className={inputCls} />
              </Field>
              <Field label="Temporary password">
                <input name="password" type="text" minLength={8} required className={inputCls} autoComplete="off" />
              </Field>
              <Field label="Role">
                <select name="role" defaultValue="editor" className={inputCls}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <SubmitButton>Add</SubmitButton>
            </form>
          )}
          <p className="mt-3 text-xs text-muted">Viewers read and ask. Editors also review, write and run the pipeline. Admins manage keys, sources and people.</p>
        </Card>
      </div>
    </>
  );
}
