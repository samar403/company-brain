import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, SourceIcon, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { getDocument } from "@/lib/store";

export default async function DocumentPage({ params }: PageProps<"/library/[id]">) {
  await requireUser();
  const { id } = await params;
  const doc = getDocument(Number(id));
  if (!doc) notFound();
  const entries = all<{ id: number; title: string; status: string; quote: string | null }>(
    `SELECT e.id, e.title, e.status, es.quote FROM entry_sources es JOIN entries e ON e.id = es.entry_id WHERE es.document_id = ?`,
    doc.id,
  );

  return (
    <article>
      <nav className="mb-6 text-sm text-muted">
        <Link href="/library" className="hover:text-ink">
          Raw library
        </Link>{" "}
        / <Link href={`/library?source=${doc.source_id}`} className="hover:text-ink">{doc.source_name}</Link>
      </nav>
      <header className="mb-6 flex items-start gap-4 border-b border-rule pb-6">
        <SourceIcon type={doc.source_type} className="mt-2 h-9 w-9 text-[11px]" />
        <div className="min-w-0">
          <p className="eyebrow">
            D{doc.id} · {doc.kind.replace("_", " ")} {doc.channel && `· ${doc.channel}`}
          </p>
          <h1 className="mt-1 font-serif text-[36px] leading-[1.05] md:text-[44px]">{doc.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {[doc.author, doc.occurred_at?.slice(0, 16).replace("T", " ")].filter(Boolean).join(" · ")}
            {doc.url && (
              <>
                {" · "}
                <a href={doc.url} target="_blank" rel="noreferrer" className="underline">
                  open original
                </a>
              </>
            )}
          </p>
        </div>
      </header>
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-x-auto p-5">
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-ink-2">{doc.content}</pre>
        </Card>
        <aside>
          <p className="eyebrow mb-3">Knowledge extracted ({entries.length})</p>
          {doc.process_error && <p className="mb-3 text-sm text-signal">Extraction failed: {doc.process_error}</p>}
          {!doc.processed_at && <Badge tone="amber">Not read yet</Badge>}
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.id}>
                <Link href={`/knowledge/${e.id}`} className="block rounded-lg border border-rule bg-surface p-3 text-sm hover:border-ink">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted">E{e.id}</span>
                    <StatusBadge status={e.status} />
                  </span>
                  <span className="mt-1 block text-ink">{e.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </article>
  );
}
