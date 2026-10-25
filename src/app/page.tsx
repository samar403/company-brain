import Link from "next/link";
import { BrainMark } from "@/components/brand";
import { btn } from "@/components/ui";
import { currentUser, userCount } from "@/lib/auth";
import { bootstrap, DEMO } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "01",
    title: "Capture",
    body: "Slack threads, shared inboxes, exported archives, docs and short staff interviews flow in. Secrets are stripped on arrival.",
  },
  {
    n: "02",
    title: "Distill",
    body: "Claude reads every source and writes atomic, cited entries: policies, processes, decisions, owners, FAQs. It merges duplicates and flags contradictions.",
  },
  {
    n: "03",
    title: "Review",
    body: "People approve, edit or reject in a fast queue. Only reviewed knowledge reaches agents, and every entry links back to the message it came from.",
  },
  {
    n: "04",
    title: "Serve",
    body: "Agents read a living operating guide and query it over MCP or REST. What they can't find becomes a question for the right teammate.",
  },
];

const FEATURES = [
  ["Cited, always", "Every entry and every answer points to the exact Slack message, email or interview behind it."],
  ["Conflicts surface", "When October's refund rule contradicts July's, you get a side-by-side decision, not a silent overwrite."],
  ["Gaps close themselves", "Unanswerable agent questions are routed to the teammate most likely to know. One answer teaches every agent."],
  ["MCP-native", "Claude Code, Claude Desktop and any agent on the Claude API connect in one line. Per-agent keys and logs."],
  ["Secrets stay out", "Tokens, passwords and card numbers are redacted before storage or any model call."],
  ["Yours to run", "One Next.js app and one SQLite file. Deploy anywhere Node runs; swap the store for Postgres when you grow."],
];

export default async function Landing() {
  bootstrap();
  const user = await currentUser();
  const primary = user ? { href: "/dashboard", label: "Open your brain" } : userCount() === 0 ? { href: "/setup", label: "Start your brain" } : { href: "/login", label: DEMO.enabled ? "Explore the live demo" : "Sign in" };

  return (
    <div className="grain min-h-screen">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-5 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <BrainMark />
          <span className="font-serif text-2xl">Company Brain</span>
        </Link>
        <nav className="flex items-center gap-2">
          <a href="#how" className={btn("quiet", true)}>
            How it works
          </a>
          <a href="#agents" className={`${btn("quiet", true)} hidden sm:inline-flex`}>
            For agents
          </a>
          <Link href={primary.href} className={btn("primary", true)}>
            {user ? "Open" : "Sign in"}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-[1120px] px-4 pb-20 pt-12 md:px-8 md:pt-20">
          <p className="eyebrow mb-5">The operating manual your AI agents were missing</p>
          <h1 className="max-w-[900px] font-serif text-[52px] leading-[0.98] tracking-tight md:text-[92px]">
            Everything your company knows, <em className="text-signal">written down</em> for the agents doing the work.
          </h1>
          <p className="mt-7 max-w-[620px] text-[17px] leading-relaxed text-ink-2">
            The rules that matter live in Slack threads, inboxes and people’s heads. Company Brain turns them into a reviewed,
            cited guide that support bots, coding agents and assistants consult before they act.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href={primary.href} className={btn("signal")}>
              {primary.label} →
            </Link>
            <a href="#how" className={btn("ghost")}>
              See how it works
            </a>
          </div>

          {/* Specimen: a page torn from the guide */}
          <div className="mt-16 grid gap-6 md:grid-cols-[1.25fr_1fr]">
            <div className="relative rounded-2xl border border-rule bg-surface p-6 md:p-8">
              <p className="eyebrow">Guide · Billing &amp; Refunds · E6</p>
              <h2 className="mt-2 font-serif text-4xl leading-tight">Refund approval rules</h2>
              <ul className="prose-brain mt-4">
                <li>
                  Support can approve <strong>full refunds within 30 days</strong> of purchase, any plan.{" "}
                  <span className="marker">Changed 2026-10-01 from 14 days.</span>
                </li>
                <li>After 30 days refunds are prorated and need Finance approval.</li>
                <li>
                  Anything above <strong>€2,000</strong> always needs Lena Fischer.
                </li>
              </ul>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-dashed border-rule-strong pt-4 font-mono text-[11px] text-muted">
                <span className="rounded border border-rule-strong px-1.5 py-0.5">SL #support · Oct 1</span>
                <span className="rounded border border-rule-strong px-1.5 py-0.5">SL #support · Jul 14</span>
                <span className="rounded bg-moss-soft px-1.5 py-0.5 text-moss">REVIEWED · 92%</span>
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-2xl bg-ink p-6 text-paper md:p-8">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/50">support-bot → company-brain</p>
                <p className="mt-3 font-mono text-sm text-paper/80">ask_company_brain(</p>
                <p className="pl-4 font-mono text-sm text-[var(--marker)]">&quot;Customer on Growth wants a refund 3 weeks in&quot;</p>
                <p className="font-mono text-sm text-paper/80">)</p>
              </div>
              <p className="mt-6 font-serif text-[22px] leading-snug">
                “Approve it: purchases within 30 days get a full refund on any plan, unless it’s over €2,000, then ask Lena in
                Finance.” <span className="font-mono text-xs text-[var(--signal)]">[E6]</span>
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="border-y border-rule bg-surface/60">
          <div className="mx-auto max-w-[1120px] px-4 py-20 md:px-8">
            <h2 className="font-serif text-5xl md:text-6xl">From chatter to a manual, continuously.</h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="bg-paper p-6">
                  <p className="font-mono text-xs text-signal">{s.n}</p>
                  <h3 className="mt-3 font-serif text-3xl">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-4 py-20 md:px-8">
          <div className="grid gap-x-10 gap-y-10 md:grid-cols-3">
            {FEATURES.map(([t, b]) => (
              <div key={t} className="border-t-2 border-ink pt-4">
                <h3 className="font-serif text-2xl">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{b}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="agents" className="mx-auto max-w-[1120px] px-4 pb-24 md:px-8">
          <div className="grid items-center gap-10 rounded-3xl border border-rule bg-surface p-6 md:grid-cols-2 md:p-12">
            <div>
              <p className="eyebrow">For agents</p>
              <h2 className="mt-2 font-serif text-5xl leading-none">One line to plug in.</h2>
              <p className="mt-4 text-ink-2">
                A remote MCP server with <code>search_knowledge</code>, <code>ask_company_brain</code>, <code>get_guide</code> and{" "}
                <code>report_knowledge_gap</code>. Or pull the whole guide as an <code>AGENTS.md</code> and drop it in a system
                prompt.
              </p>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-ink p-5 font-mono text-[12.5px] leading-relaxed text-paper">
              {`claude mcp add --transport http \\
  company-brain https://brain.acme.com/api/mcp \\
  --header "Authorization: Bearer cb_live_…"

curl https://brain.acme.com/api/v1/guide?format=md \\
  -H "Authorization: Bearer cb_live_…" > AGENTS.md`}
            </pre>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted md:px-8">
          <span>Company Brain · built with Claude</span>
          <Link href={primary.href} className="hover:text-ink">
            {primary.label} →
          </Link>
        </div>
      </footer>
    </div>
  );
}
