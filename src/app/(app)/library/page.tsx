import Link from "next/link";
import { Badge, Empty, PageHeader, SourceIcon, inputCls, timeAgo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { searchDocuments } from "@/lib/search";
import { getSource, listDocuments } from "@/lib/store";

export const metadata = { title: "Raw library" };

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const sourceId = Number(sp.source) || undefined;
  const source = sourceId ? getSource(sourceId) : undefined;
  const docs = q
    ? searchDocuments(q, 50).map((d) => ({ ...d, content: d.snippet, processed_at: "y", process_error: null, entry_count: null, source_name: "" }))
    : listDocuments({ sourceId });

  return (
    <>
      <PageHeader
        index="06"
        title="Raw library"
        lede={source ? `Everything ingested from ${source.name}.` : "Every thread, email and note ingested, exactly as stored (secrets already redacted)."}
      />
      <form className="mb-6" role="search">
        <input name="q" defaultValue={q} placeholder="Search raw sources…" className={inputCls} aria-label="Search raw sources" />
      </form>
      {docs.length === 0 ? (
        <Empty title="No documents">Connect a source or upload files to fill the library.</Empty>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/library/${d.id}`} className="flex gap-4 py-3.5 hover:bg-sunken/40 md:px-2">
                <SourceIcon type={d.source_type} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{d.title}</span>
                  <span className="mt-0.5 line-clamp-1 block text-sm text-muted">{d.content.replace(/[«»]/g, "")}</span>
                </span>
                <span className="hidden shrink-0 flex-col items-end gap-1 md:flex">
                  {d.process_error ? (
                    <Badge tone="signal">error</Badge>
                  ) : !d.processed_at ? (
                    <Badge tone="amber">unread</Badge>
                  ) : d.entry_count !== null ? (
                    <Badge>{d.entry_count} entries</Badge>
                  ) : null}
                  <span className="font-mono text-[11px] text-muted">{timeAgo(d.occurred_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
