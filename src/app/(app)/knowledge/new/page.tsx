import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listTopics } from "@/lib/store";
import { EntryEditor } from "../editor";

export const metadata = { title: "New entry" };

export default async function NewEntryPage() {
  await requireUser("editor");
  return (
    <>
      <PageHeader index="05" title="Write an entry" lede="Human-written entries are published as reviewed immediately." />
      <div className="max-w-3xl">
        <EntryEditor topics={listTopics().map((t) => t.name)} />
      </div>
    </>
  );
}
