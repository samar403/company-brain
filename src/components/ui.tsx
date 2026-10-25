import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ENTRY_TYPE_LABEL, type EntryType } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({
  index,
  title,
  lede,
  actions,
}: {
  index?: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-rule pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {index && <p className="eyebrow mb-2">§ {index}</p>}
        <h1 className="font-serif text-[44px] leading-[1] tracking-tight text-ink md:text-[56px]">{title}</h1>
        {lede && <p className="mt-3 max-w-2xl text-[15px] text-ink-2">{lede}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const BTN = {
  base: "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
  primary: "bg-ink text-paper hover:bg-signal hover:text-signal-ink px-4 py-2",
  signal: "bg-signal text-signal-ink hover:brightness-110 px-4 py-2",
  ghost: "border border-rule-strong text-ink hover:border-ink px-4 py-2 bg-transparent",
  quiet: "text-ink-2 hover:text-ink hover:bg-sunken px-3 py-1.5",
  danger: "border border-rule-strong text-signal hover:bg-signal-soft px-4 py-2",
  sm: "!px-3 !py-1 text-[13px]",
};
export type BtnVariant = "primary" | "signal" | "ghost" | "quiet" | "danger";

export function btn(variant: BtnVariant = "primary", small = false) {
  return cx(BTN.base, BTN[variant], small && BTN.sm);
}

export function Button({
  variant = "primary",
  small,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: BtnVariant; small?: boolean }) {
  return <button className={cx(btn(variant, small), className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  small,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: BtnVariant; small?: boolean }) {
  return <Link className={cx(btn(variant, small), className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-rule bg-surface", className)} {...props} />;
}

type Tone = "neutral" | "signal" | "moss" | "amber" | "ink";
const TONES: Record<Tone, string> = {
  neutral: "border-rule-strong text-ink-2 bg-transparent",
  signal: "border-transparent bg-signal-soft text-signal",
  moss: "border-transparent bg-moss-soft text-moss",
  amber: "border-transparent bg-amber-soft text-amber",
  ink: "border-transparent bg-ink text-paper",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-[1px] font-mono text-[10.5px] uppercase tracking-[0.08em]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone = status === "approved" ? "moss" : status === "pending" ? "amber" : status === "rejected" ? "signal" : "neutral";
  const label = status === "approved" ? "Reviewed" : status === "pending" ? "Needs review" : status;
  return <Badge tone={tone}>{label}</Badge>;
}

export function TypeBadge({ type }: { type: EntryType }) {
  return <Badge>{ENTRY_TYPE_LABEL[type] ?? type}</Badge>;
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted" title={`Confidence ${pct}%`}>
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-sunken">
        <span
          className={cx("absolute inset-y-0 left-0 rounded-full", pct >= 80 ? "bg-moss" : pct >= 60 ? "bg-amber" : "bg-signal")}
          style={{ width: `${pct}%` }}
        />
      </span>
      {pct}%
    </span>
  );
}

export function SourceIcon({ type, className = "" }: { type: string; className?: string }) {
  const label: Record<string, string> = { slack: "SL", email: "EM", staff: "ST", upload: "UP", webhook: "WH" };
  return (
    <span
      aria-label={type}
      className={cx(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-rule-strong font-mono text-[9.5px] font-medium text-ink-2",
        className,
      )}
    >
      {label[type] ?? "··"}
    </span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-rule-strong px-6 py-12 text-center">
      <p className="font-serif text-2xl text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const inner = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-serif text-[44px] leading-none text-ink">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block border-l border-rule px-5 py-1 transition-colors first:border-l-0 hover:bg-sunken/50">
      {inner}
    </Link>
  ) : (
    <div className="border-l border-rule px-5 py-1 first:border-l-0">{inner}</div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-rule-strong bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}
