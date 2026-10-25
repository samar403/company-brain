import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/db";
import { listEntries } from "@/lib/store";
import { AskPanel } from "./panel";

export const metadata = { title: "Ask" };

export default async function AskPage() {
  await requireUser();
  const company = getSetting("company_name", "the company");
  const faqs = listEntries({ status: "approved", type: "faq", limit: 2 }).map((e) => e.title);
  const examples = [
    ...faqs,
    "Can I give a customer a 20% discount?",
    "A customer wants a refund after 3 weeks. What do I do?",
    "Who do I page if the dashboard is down?",
  ].slice(0, 5);

  return (
    <>
      <PageHeader
        index="08"
        title="Ask"
        lede={`Test the brain the way your agents use it. Answers come only from ${company}'s knowledge, with citations. Anything it can't answer becomes a question for your team.`}
      />
      <AskPanel examples={examples} />
    </>
  );
}
