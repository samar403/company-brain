import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "@/app/actions";
import { BrainMark } from "@/components/brand";
import { NavLink, Notice, ThemeToggle } from "@/components/client";
import { aiEnabled, MODEL } from "@/lib/ai/claude";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/db";
import { stats } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const s = stats();
  const company = getSetting("company_name", "Your company");
  const ai = aiEnabled();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b border-rule bg-paper md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-6 p-4 md:p-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <BrainMark />
            <span className="leading-tight">
              <span className="block font-serif text-[22px] leading-none text-ink">Company Brain</span>
              <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">{company}</span>
            </span>
          </Link>

          <nav className="-mx-1 flex gap-1 overflow-x-auto md:mx-0 md:flex-col md:overflow-visible" aria-label="Main">
            <p className="eyebrow hidden px-3 pt-1 md:block">Capture</p>
            <NavLink href="/dashboard" index="01">Overview</NavLink>
            <NavLink href="/sources" index="02" badge={s.unprocessed}>Sources</NavLink>
            <NavLink href="/interviews" index="03" badge={s.openQuestions}>Staff Q&amp;A</NavLink>
            <p className="eyebrow hidden px-3 pt-4 md:block">Curate</p>
            <NavLink href="/review" index="04" badge={s.pending + s.conflicts}>Review</NavLink>
            <NavLink href="/knowledge" index="05">Knowledge</NavLink>
            <NavLink href="/library" index="06">Raw library</NavLink>
            <p className="eyebrow hidden px-3 pt-4 md:block">Use</p>
            <NavLink href="/guide" index="07">The Guide</NavLink>
            <NavLink href="/ask" index="08">Ask</NavLink>
            <NavLink href="/agents" index="09">Agents &amp; API</NavLink>
            <NavLink href="/settings" index="10">Settings</NavLink>
          </nav>

          <div className="mt-auto hidden space-y-3 md:block">
            <div className="rounded-lg border border-rule px-3 py-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-ink">
                <span className={`h-1.5 w-1.5 rounded-full ${ai ? "bg-moss" : "bg-amber"}`} />
                {ai ? "Claude connected" : "Offline mode"}
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] text-muted">{ai ? MODEL : "set ANTHROPIC_API_KEY"}</p>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="truncate" title={user.email}>
                {user.name} · {user.role}
              </span>
              <form action={logoutAction}>
                <button className="hover:text-ink">Sign out</button>
              </form>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-[1080px]">
          <Suspense>
            <Notice />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
  );
}
