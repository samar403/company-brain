"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { btn, cx, type BtnVariant } from "./ui";

export function SubmitButton({
  children,
  pending,
  variant = "primary",
  small,
  className,
  ...props
}: ComponentProps<"button"> & { pending?: ReactNode; variant?: BtnVariant; small?: boolean }) {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className={cx(btn(variant, small), className)} {...props}>
      {status.pending ? (
        <>
          <Dots />
          {pending ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Dots() {
  return (
    <span className="thinking inline-flex gap-0.5" aria-hidden>
      <span>•</span>
      <span>•</span>
      <span>•</span>
    </span>
  );
}

export function NavLink({ href, index, children, badge }: { href: string; index: string; children: ReactNode; badge?: number }) {
  const path = usePathname();
  const active = path === href || (href !== "/dashboard" && path.startsWith(href));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors",
        active ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken hover:text-ink",
      )}
    >
      <span className={cx("font-mono text-[10.5px]", active ? "text-paper/60" : "text-muted")}>{index}</span>
      <span className="flex-1">{children}</span>
      {!!badge && (
        <span
          className={cx(
            "rounded-full px-1.5 font-mono text-[10.5px]",
            active ? "bg-signal text-signal-ink" : "bg-signal-soft text-signal",
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    // Sync with the value the pre-paint script applied.
    setTheme(document.documentElement.dataset.theme ?? null); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  const cycle = () => {
    const next = theme === "dark" ? "light" : theme === "light" ? null : "dark";
    setTheme(next);
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    try {
      if (next) localStorage.setItem("cb-theme", next);
      else localStorage.removeItem("cb-theme");
    } catch {}
  };
  return (
    <button onClick={cycle} className={btn("quiet", true)} title="Switch theme">
      Theme: {theme ?? "auto"}
    </button>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={btn("ghost", true)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** Shows ?notice= / ?error= set by server actions after a redirect. */
export function Notice() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const notice = params.get("notice");
  const error = params.get("error");
  if (!notice && !error) return null;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("notice");
    next.delete("error");
    router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return (
    <div
      role="status"
      className={cx(
        "mb-6 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm",
        error ? "border-signal/40 bg-signal-soft text-signal" : "border-moss/30 bg-moss-soft text-moss",
      )}
    >
      <span>{error ?? notice}</span>
      <button onClick={close} className="font-mono text-xs opacity-70 hover:opacity-100" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
