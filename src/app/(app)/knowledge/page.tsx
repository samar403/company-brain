import Link from "next/link";
import { AutoSubmitSelect } from "@/components/client";
import { Confidence, Empty, LinkButton, PageHeader, StatusBadge, TypeBadge, inputCls, timeAgo } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { searchEntries } from "@/lib/search";
import { listEntries, listTopics } from "@/lib/store";
import { ENTRY_TYPES, ENTRY_TYPE_LABEL } from "@/lib/types";

export const metadata = { title: "Knowledge" };

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = one("q");
  const topic = one("topic");
  const type = one("type");
  const status = one("status") || "approved";
  const topics = listTopics();
  const topicId = topics.find((t) => t.slug === topic)?.id;

  const entries = q
    ? searchEntries(q, { limit: 100, includePending: status !== "approved", topicSlug: topic || undefined, type: type || undefined })
    : listEntries({ status: status === "all" ? undefined : status, topicId, type: type || undefined });

  return (
    <>
      <PageHeader
        index="05"
        title="Knowledge"
        lede="Atomic, cited entries: the facts, rules, processes, decisions and owners agents rely on."
        actions={can(user, "editor") && <LinkButton href="/knowledge/new">Write an entry</LinkButton>}
      />

      <form className="mb-6 grid gap-2 md:grid-cols-[1fr_180px_150px_150px]" role="search">
        <input name="q" defaultValue={q} placeholder="Search knowledge…" className={inputCls} aria-label="Search" />
        <AutoSubmitSelect name="topic" defaultValue={topic} className={inputCls} aria-label="Topic">
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.slug}>
              {t.name}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="type" defaultValue={type} className={inputCls} aria-label="Type">
          <option value="">All types</option>
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ENTRY_TYPE_LABEL[t]}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="status" defaultValue={status} className={inputCls} aria-label="Status">
          <option value="approved">Reviewed</option>
          <option value="pending">Needs review</option>
          <option value="rejected">Rejected</option>
          <option value="stale">Stale</option>
          <option value="all">Everything</option>
        </AutoSubmitSelect>
      </form>

      {entries.length === 0 ? (
        <Empty title="Nothing here yet">Try another filter, or connect a source so Claude has something to read.</Empty>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/knowledge/${e.id}`} className="grid gap-1 py-4 hover:bg-sunken/40 md:grid-cols-[64px_1fr_auto] md:gap-4 md:px-2">
                <span className="font-mono text-xs text-muted">E{e.id}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{e.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted">
                    {"snippet" in e && e.snippet ? (e.snippet as string).replace(/[«»]/g, "") : e.body.replace(/[#*`>-]/g, " ").slice(0, 220)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 md:flex-col md:items-end">
                  <span className="flex gap-1.5">
                    <TypeBadge type={e.type} />
                    {e.status !== "approved" && <StatusBadge status={e.status} />}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {e.topic_name} · <Confidence value={e.confidence} /> · {timeAgo(e.updated_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
