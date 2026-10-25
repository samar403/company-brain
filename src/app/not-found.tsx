import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grain flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-serif text-6xl">Not in the brain.</h1>
      <p className="text-muted">That page doesn’t exist, or the entry was deleted.</p>
      <Link href="/dashboard" className="underline decoration-[var(--signal)] underline-offset-4">
        Back to the overview
      </Link>
    </div>
  );
}
