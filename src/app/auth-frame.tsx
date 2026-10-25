import Link from "next/link";
import { BrainMark } from "@/components/brand";

export function AuthFrame({ title, children, aside }: { title: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="grain flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <BrainMark />
          <span className="font-serif text-2xl">Company Brain</span>
        </Link>
        <div className="rounded-2xl border border-rule bg-surface p-6 shadow-[0_1px_0_var(--rule)] md:p-8">
          <h1 className="mb-6 font-serif text-4xl leading-none">{title}</h1>
          {children}
        </div>
        {aside && <div className="mt-4 text-sm text-muted">{aside}</div>}
      </div>
    </div>
  );
}
