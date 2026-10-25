import "server-only";
import { get, logActivity, run, setSetting } from "./db";
import {
  addEvidence,
  createConflict,
  createEntry,
  ensureSource,
  ensureTopic,
  ingestDocuments,
  markProcessed,
  updateTopicSummary,
  upsertQuestion,
} from "./store";
import type { EntryType, IncomingDoc } from "./types";

/**
 * Demo workspace: "Northwind Labs", a 60-person B2B SaaS company selling Beacon,
 * a product-analytics tool. Raw Slack threads, emails and staff answers are
 * loaded together with the knowledge Claude extracted from them, so the product
 * can be explored without credentials. Everything here is fictional.
 */

const d = (day: string, time = "10:00") => `2026-${day}T${time}:00.000Z`;

const SLACK: IncomingDoc[] = [
  {
    externalId: "eng:1",
    kind: "slack_thread",
    channel: "#eng",
    title: "#eng: Hotfix process, writing it down once and for all",
    author: "Priya Raman",
    occurredAt: d("09-02", "09:14"),
    content: `[2026-09-02 09:14] Priya Raman: Third time this month someone asked how hotfixes work, so writing it down once and for all.
[2026-09-02 09:15] Priya Raman: 1) branch from \`release\` not \`main\`, name it hotfix/<ticket>. 2) PR needs one approval from the on-call engineer, not just anyone. 3) merge, then the deploy bot ships release to prod automatically. 4) cherry-pick the fix back to main the same day.
[2026-09-02 09:21] Tom Becker: what if on-call is the one who wrote the fix?
[2026-09-02 09:22] Priya Raman: then any staff engineer approves. and post in #incidents so support knows.
[2026-09-02 09:40] Marcus Lee: +1. also never hotfix on Fridays after 3pm Berlin time unless it's a Sev1.`,
  },
  {
    externalId: "eng:2",
    kind: "slack_thread",
    channel: "#eng",
    title: "#eng: Moving staging to the new cluster",
    author: "Marcus Lee",
    occurredAt: d("09-18", "14:02"),
    content: `[2026-09-18 14:02] Marcus Lee: Heads up: staging moved to the new cluster. URL is now staging.beacon-internal.dev (old stg.northwind.io is dead).
[2026-09-18 14:05] Ana Souza: do seed accounts still work?
[2026-09-18 14:06] Marcus Lee: yes, same seed users. test org is "acme-demo". DB resets every Sunday 02:00 UTC so don't keep anything important there.`,
  },
  {
    externalId: "incidents:1",
    kind: "slack_thread",
    channel: "#incidents",
    title: "#incidents: Severity levels and who gets paged",
    author: "Priya Raman",
    occurredAt: d("08-11", "16:30"),
    content: `[2026-08-11 16:30] Priya Raman: Agreed in the incident retro, severity levels going forward:
Sev1 = Beacon down or data loss for any customer. Page on-call immediately via PagerDuty, status page update within 15 min, CTO informed.
Sev2 = major feature broken for many customers (dashboards not loading, ingestion delayed > 1h). Page on-call, status page within 30 min.
Sev3 = bug with a workaround. Ticket in Linear, no page.
[2026-08-11 16:34] Jonas Weber: who updates the status page?
[2026-08-11 16:35] Priya Raman: incident commander, which is whoever is on-call unless they hand it off. Support lead (Ana) handles customer emails for Sev1/Sev2.`,
  },
  {
    externalId: "support:1",
    kind: "slack_thread",
    channel: "#support",
    title: "#support: Refund requests, what can we approve?",
    author: "Ana Souza",
    occurredAt: d("07-14", "11:05"),
    content: `[2026-07-14 11:05] Ana Souza: customer on annual Growth plan wants a refund 3 weeks in. what can support approve without finance?
[2026-07-14 11:20] Lena Fischer: Support can approve full refunds within 14 days of purchase, any plan. After that it's prorated and finance has to approve. Anything above €2,000 always needs me regardless.
[2026-07-14 11:21] Ana Souza: thanks. so this one goes to finance.`,
  },
  {
    externalId: "support:2",
    kind: "slack_thread",
    channel: "#support",
    title: "#support: Refund window is now 30 days",
    author: "Lena Fischer",
    occurredAt: d("10-01", "08:45"),
    content: `[2026-10-01 08:45] Lena Fischer: Policy update effective today: refund window for full refunds is now 30 days (was 14). Board approved it to reduce churn complaints. The €2,000 finance approval threshold stays the same.
[2026-10-01 08:50] Ana Souza: updating the macros in Zendesk now`,
  },
  {
    externalId: "support:3",
    kind: "slack_thread",
    channel: "#support",
    title: "#support: How do customers export raw events?",
    author: "Tom Becker",
    occurredAt: d("09-25", "13:12"),
    content: `[2026-09-25 13:12] Tom Becker: customers keep asking how to export raw events. Answer: Settings → Data → Export, choose CSV or Parquet. Exports over 10M rows go to their S3 bucket instead of download, they need to connect S3 first. Only org admins see the Export tab.
[2026-09-25 13:15] Ana Souza: adding to the FAQ, thanks Tom`,
  },
  {
    externalId: "sales:1",
    kind: "slack_thread",
    channel: "#sales",
    title: "#sales: Discount approvals",
    author: "Jonas Weber",
    occurredAt: d("08-28", "10:00"),
    content: `[2026-08-28 10:00] Jonas Weber: reminder on discounts: AEs can give up to 15% on annual deals on their own. 15-25% needs my approval in HubSpot (deal stage "Discount review"). Over 25% goes to the CEO. Never discount monthly plans.
[2026-08-28 10:05] Sofia Kim: does the startup program count?
[2026-08-28 10:07] Jonas Weber: no, startup program (50% off year one, <20 employees, <$5M raised) is separate and doesn't need approval. apply the STARTUP50 coupon.`,
  },
  {
    externalId: "sales:0",
    kind: "slack_thread",
    channel: "#sales",
    title: "#sales: quick q on discounts for the Q1 push",
    author: "Ben Ortiz",
    occurredAt: d("03-04", "16:20"),
    content: `[2026-03-04 16:20] Ben Ortiz: for the Q1 push, can we just do 20% on annual deals without asking?
[2026-03-04 16:22] Ben Ortiz: pretty sure that's what we did last year. going with 20% unless someone objects
[2026-03-04 16:40] Sofia Kim: 👍`,
  },
  {
    externalId: "sales:2",
    kind: "slack_thread",
    channel: "#sales",
    title: "#sales: Security questionnaires",
    author: "Sofia Kim",
    occurredAt: d("09-09", "15:40"),
    content: `[2026-09-09 15:40] Sofia Kim: who handles security questionnaires from prospects?
[2026-09-09 15:44] Marcus Lee: send them to security@northwind.io, I own those. We're SOC 2 Type II (report renewed in June), data hosted in AWS eu-central-1 (Frankfurt). SOC 2 report only under NDA. password: hunter2-do-not-share
[2026-09-09 15:46] Sofia Kim: perfect, thanks`,
  },
  {
    externalId: "general:1",
    kind: "slack_thread",
    channel: "#general",
    title: "#general: Glossary for new folks",
    author: "Ana Souza",
    occurredAt: d("06-03", "09:00"),
    content: `[2026-06-03 09:00] Ana Souza: little glossary for new folks:
- "Beacon" = our product. "Beacon Edge" = the self-hosted collector.
- "Org" = a customer account. "Workspace" = a project inside an org.
- "MTU" = monthly tracked users, what we bill on.
- "Lighthouse" = internal admin tool for support (lighthouse.beacon-internal.dev)`,
  },
  {
    externalId: "product:1",
    kind: "slack_thread",
    channel: "#product",
    title: "#product: Decision on Beacon Edge pricing",
    author: "Elena Novak",
    occurredAt: d("09-30", "17:10"),
    content: `[2026-09-30 17:10] Elena Novak: Decision from today's pricing review: Beacon Edge (self-hosted) is only sold on the Enterprise plan from Q4 on. Existing Growth customers using Edge are grandfathered until their renewal. Reason: support cost of self-hosted installs is 4x cloud.
[2026-09-30 17:12] Jonas Weber: noted, I'll brief the AEs`,
  },
];

const EMAIL: IncomingDoc[] = [
  {
    externalId: "thread:expense policy 2026",
    kind: "email_thread",
    title: "Expense policy 2026",
    author: "Lena Fischer <lena@northwind.io>",
    occurredAt: d("01-08", "08:00"),
    content: `From: Lena Fischer <lena@northwind.io>
Date: 2026-01-08

Hi all,

Expense policy for 2026:
- Submit expenses in Pleo within 30 days, with a receipt photo.
- Meals while travelling: up to €60/day. Team dinners need your manager's OK first.
- Flights: economy for anything under 6 hours. Book through TravelPerk.
- Home office budget: €500 per year, no approval needed.
- Anything above €1,000 needs pre-approval from your department head.

Lena (Finance)`,
  },
  {
    externalId: "thread:onboarding checklist for new engineers",
    kind: "email_thread",
    title: "Onboarding checklist for new engineers",
    author: "Priya Raman <priya@northwind.io>",
    occurredAt: d("05-20", "12:00"),
    content: `From: Priya Raman <priya@northwind.io>
Date: 2026-05-20

Hi managers, here is the standard first-week checklist for engineers:
1. Day 1: laptop + Okta account from IT (it@northwind.io), join #eng, #incidents, #deploys.
2. Day 1: get added to GitHub org "northwind-labs" and Linear team.
3. Day 2: run Beacon locally using the README in the monorepo; ask in #eng-help if stuck.
4. Week 1: ship one small PR to production with a buddy.
5. Week 2: shadow the on-call engineer for one day. People join the on-call rotation after 6 weeks.

Priya`,
  },
  {
    externalId: "thread:enterprise sla",
    kind: "email_thread",
    title: "Enterprise SLA",
    author: "Jonas Weber <jonas@northwind.io>",
    occurredAt: d("07-02", "09:30"),
    content: `From: Jonas Weber <jonas@northwind.io>
Date: 2026-07-02

Team, for clarity in contracts: Enterprise plan SLA is 99.9% monthly uptime, first response to Sev1 tickets within 1 hour 24/7, Sev2 within 4 business hours. Growth plan has no SLA, best-effort support during business hours (Mon-Fri 9-18 CET). Service credits: 10% of the monthly fee per 0.1% below target, capped at 30%.

---

From: Lena Fischer <lena@northwind.io>
Date: 2026-07-02

Confirming the credit cap is 30%. Credits are applied to the next invoice, never paid out in cash.`,
  },
  {
    externalId: "thread:customer data deletion requests",
    kind: "email_thread",
    title: "Customer data deletion requests",
    author: "Marcus Lee <marcus@northwind.io>",
    occurredAt: d("08-19", "10:20"),
    content: `From: Marcus Lee <marcus@northwind.io>
Date: 2026-08-19

For GDPR deletion requests: support must verify the request comes from an org admin (check in Lighthouse), then open a ticket in Linear with the label "gdpr-delete". Engineering runs the deletion job within 7 days; legal deadline is 30 days. Never delete data manually in the database. Reply to the customer with the ticket number.

Marcus`,
  },
];

const STAFF: IncomingDoc[] = [
  {
    externalId: "qa:1",
    kind: "qa",
    title: "Q: Who do customers contact for billing questions?",
    author: "Lena Fischer",
    occurredAt: d("09-12", "10:00"),
    content: `Question: Who do customers contact for billing questions, and how fast do we reply?
Answer (Lena Fischer, Finance): billing@northwind.io. Finance replies within 2 business days. Invoices are issued on the 1st of the month via Stripe; customers can download them under Settings → Billing.`,
  },
  {
    externalId: "qa:2",
    kind: "qa",
    title: "Q: What's the PTO policy?",
    author: "Elena Novak",
    occurredAt: d("06-15", "10:00"),
    content: `Question: What's the PTO policy?
Answer (Elena Novak, People): 28 days of paid vacation per year plus public holidays of your home country. Request in Personio at least 2 weeks ahead for anything longer than 3 days. Unused days carry over until March 31 of the next year.`,
  },
];

type DemoEntry = {
  topic: string;
  type: EntryType;
  title: string;
  body: string;
  confidence: number;
  status?: "approved" | "pending";
  origin?: "ai" | "human";
  owner?: string;
  evidence: [string, string][]; // [externalId, quote]
};

const ENTRIES: DemoEntry[] = [
  {
    topic: "Engineering Workflow",
    type: "process",
    title: "How to ship a hotfix",
    body: `1. Branch from \`release\` (not \`main\`) and name it \`hotfix/<ticket>\`.
2. Get one approval from the **on-call engineer**. If on-call wrote the fix, any staff engineer can approve.
3. Merge. The deploy bot ships \`release\` to production automatically.
4. Cherry-pick the fix back to \`main\` the same day.
5. Post in #incidents so support knows.

No hotfixes on Fridays after 15:00 Berlin time unless it is a Sev1.`,
    confidence: 0.94,
    owner: "Priya Raman (Engineering)",
    evidence: [
      ["eng:1", "branch from `release` not `main`, name it hotfix/<ticket>. 2) PR needs one approval from the on-call engineer"],
      ["eng:1", "never hotfix on Fridays after 3pm Berlin time unless it's a Sev1."],
    ],
  },
  {
    topic: "Engineering Workflow",
    type: "fact",
    title: "Staging environment",
    body: `Staging lives at **staging.beacon-internal.dev** (the old stg.northwind.io is retired). Seed users still work; the test org is \`acme-demo\`. The staging database resets every **Sunday at 02:00 UTC**, so never keep anything important there.`,
    confidence: 0.9,
    owner: "Marcus Lee",
    evidence: [["eng:2", "staging moved to the new cluster. URL is now staging.beacon-internal.dev"]],
  },
  {
    topic: "Engineering Workflow",
    type: "process",
    title: "First two weeks for a new engineer",
    body: `1. Day 1: laptop and Okta account from IT (it@northwind.io); join #eng, #incidents and #deploys.
2. Day 1: get added to the GitHub org \`northwind-labs\` and the Linear team.
3. Day 2: run Beacon locally from the monorepo README; ask in #eng-help if stuck.
4. Week 1: ship one small PR to production with a buddy.
5. Week 2: shadow the on-call engineer for a day. Engineers join the on-call rotation after 6 weeks.`,
    confidence: 0.88,
    owner: "Priya Raman",
    evidence: [["thread:onboarding checklist for new engineers", "standard first-week checklist for engineers"]],
  },
  {
    topic: "Incidents & Reliability",
    type: "policy",
    title: "Incident severity levels and paging",
    body: `- **Sev1**: Beacon down or data loss for any customer. Page on-call via PagerDuty immediately, update the status page within **15 minutes**, inform the CTO.
- **Sev2**: a major feature broken for many customers (e.g. dashboards not loading, ingestion delayed over 1 hour). Page on-call, status page within **30 minutes**.
- **Sev3**: a bug with a workaround. Create a Linear ticket; no page.

The incident commander (on-call, unless handed off) updates the status page. Ana Souza (support lead) handles customer emails for Sev1 and Sev2.`,
    confidence: 0.95,
    owner: "Priya Raman",
    evidence: [["incidents:1", "Sev1 = Beacon down or data loss for any customer. Page on-call immediately via PagerDuty"]],
  },
  {
    topic: "Incidents & Reliability",
    type: "policy",
    title: "Enterprise SLA and service credits",
    body: `- **Enterprise**: 99.9% monthly uptime. First response to Sev1 tickets within **1 hour, 24/7**; Sev2 within **4 business hours**.
- **Growth**: no SLA; best-effort support Mon–Fri 09:00–18:00 CET.
- Service credits: 10% of the monthly fee per 0.1% below target, **capped at 30%**. Credits go on the next invoice and are never paid out in cash.`,
    confidence: 0.93,
    owner: "Jonas Weber (Sales)",
    evidence: [
      ["thread:enterprise sla", "Enterprise plan SLA is 99.9% monthly uptime, first response to Sev1 tickets within 1 hour 24/7"],
      ["thread:enterprise sla", "Confirming the credit cap is 30%. Credits are applied to the next invoice"],
    ],
  },
  {
    topic: "Billing & Refunds",
    type: "policy",
    title: "Refund approval rules",
    body: `- Support can approve **full refunds within 30 days** of purchase on any plan (changed on 2026-10-01 from 14 days).
- After 30 days, refunds are prorated and need Finance approval.
- Any refund above **€2,000** always needs Lena Fischer (Finance), regardless of timing.`,
    confidence: 0.92,
    owner: "Lena Fischer (Finance)",
    evidence: [
      ["support:2", "refund window for full refunds is now 30 days (was 14)"],
      ["support:1", "Anything above €2,000 always needs me regardless."],
    ],
  },
  {
    topic: "Billing & Refunds",
    type: "faq",
    title: "Where do customers get help with billing?",
    body: `Email **billing@northwind.io**; Finance replies within 2 business days. Invoices are issued on the 1st of each month through Stripe and can be downloaded under **Settings → Billing**.`,
    confidence: 0.95,
    origin: "human",
    owner: "Lena Fischer",
    evidence: [["qa:1", "billing@northwind.io. Finance replies within 2 business days."]],
  },
  {
    topic: "Customer Support",
    type: "faq",
    title: "How do customers export raw events?",
    body: `**Settings → Data → Export**, then choose CSV or Parquet. Exports over **10M rows** are delivered to the customer's S3 bucket instead of a download, so they must connect S3 first. Only **org admins** can see the Export tab.`,
    confidence: 0.86,
    evidence: [["support:3", "Settings → Data → Export, choose CSV or Parquet. Exports over 10M rows go to their S3 bucket"]],
  },
  {
    topic: "Customer Support",
    type: "process",
    title: "Handling GDPR data deletion requests",
    body: `1. Verify the request comes from an **org admin** (check in Lighthouse).
2. Open a Linear ticket with the label \`gdpr-delete\`.
3. Reply to the customer with the ticket number.
4. Engineering runs the deletion job within 7 days (legal deadline: 30 days).

Never delete customer data manually in the database.`,
    confidence: 0.9,
    owner: "Marcus Lee",
    evidence: [["thread:customer data deletion requests", "support must verify the request comes from an org admin (check in Lighthouse)"]],
  },
  {
    topic: "Sales",
    type: "policy",
    title: "Discount approval levels",
    body: `- Up to **15%** on annual deals: the AE decides.
- **15–25%**: Jonas Weber approves in HubSpot (move the deal to stage "Discount review").
- **Over 25%**: the CEO approves.
- Never discount monthly plans.

The startup program is separate and needs no approval (see Startup program).`,
    confidence: 0.93,
    owner: "Jonas Weber",
    evidence: [["sales:1", "AEs can give up to 15% on annual deals on their own. 15-25% needs my approval in HubSpot"]],
  },
  {
    topic: "Sales",
    type: "policy",
    title: "Startup program",
    body: `50% off the first year for companies with **fewer than 20 employees** that have raised **less than $5M**. Apply the coupon \`STARTUP50\`; no approval needed.`,
    confidence: 0.9,
    owner: "Jonas Weber",
    evidence: [["sales:1", "startup program (50% off year one, <20 employees, <$5M raised) is separate"]],
  },
  {
    topic: "Sales",
    type: "decision",
    title: "Beacon Edge is Enterprise-only from Q4 2026",
    body: `Decided 2026-09-30: Beacon Edge (self-hosted) is sold **only on the Enterprise plan** from Q4 2026. Growth customers already using Edge keep it until their renewal. Reason: self-hosted installs cost about 4x more to support than cloud.`,
    confidence: 0.91,
    owner: "Elena Novak (Product)",
    evidence: [["product:1", "Beacon Edge (self-hosted) is only sold on the Enterprise plan from Q4 on."]],
  },
  {
    topic: "Security & Compliance",
    type: "contact",
    title: "Security questionnaires and compliance facts",
    body: `Send prospect security questionnaires to **security@northwind.io**; Marcus Lee owns them.
- SOC 2 Type II, report renewed June 2026. Share the report **only under NDA**.
- Customer data is hosted in **AWS eu-central-1 (Frankfurt)**.`,
    confidence: 0.89,
    owner: "Marcus Lee",
    evidence: [["sales:2", "send them to security@northwind.io, I own those. We're SOC 2 Type II"]],
  },
  {
    topic: "People & Policies",
    type: "policy",
    title: "Expense policy",
    body: `- Submit expenses in **Pleo** within 30 days, with a receipt photo.
- Travel meals: up to **€60/day**. Team dinners need your manager's OK first.
- Flights: economy for flights under 6 hours, booked through TravelPerk.
- Home office budget: **€500/year**, no approval needed.
- Anything over **€1,000** needs pre-approval from your department head.`,
    confidence: 0.92,
    owner: "Lena Fischer",
    evidence: [["thread:expense policy 2026", "Submit expenses in Pleo within 30 days, with a receipt photo."]],
  },
  {
    topic: "People & Policies",
    type: "policy",
    title: "Paid time off",
    body: `28 days of paid vacation per year plus the public holidays of your home country. Request in **Personio** at least 2 weeks ahead for anything longer than 3 days. Unused days carry over until **March 31** of the following year.`,
    confidence: 0.95,
    origin: "human",
    owner: "Elena Novak (People)",
    evidence: [["qa:2", "28 days of paid vacation per year plus public holidays of your home country."]],
  },
  {
    topic: "Company Glossary",
    type: "glossary",
    title: "Internal terms",
    body: `- **Beacon**: our product. **Beacon Edge**: the self-hosted collector.
- **Org**: a customer account. **Workspace**: a project inside an org.
- **MTU**: monthly tracked users; what customers are billed on.
- **Lighthouse**: the internal support admin tool (lighthouse.beacon-internal.dev).`,
    confidence: 0.9,
    evidence: [["general:1", "\"MTU\" = monthly tracked users, what we bill on."]],
  },
  {
    topic: "Customer Support",
    type: "fact",
    title: "Support hours for Growth customers",
    body: `Growth plan customers get best-effort support Monday to Friday, 09:00–18:00 CET. There is no weekend coverage outside Sev1 incidents.`,
    confidence: 0.62,
    status: "pending",
    evidence: [["thread:enterprise sla", "best-effort support during business hours (Mon-Fri 9-18 CET)"]],
  },
];

const TOPIC_ORDER = [
  "Customer Support",
  "Billing & Refunds",
  "Sales",
  "Engineering Workflow",
  "Incidents & Reliability",
  "Security & Compliance",
  "People & Policies",
  "Company Glossary",
];

export function demoLoaded(): boolean {
  return Boolean(get("SELECT 1 FROM sources WHERE json_extract(config, '$.demo') = 1"));
}

export function loadDemoData(actor: string) {
  if (demoLoaded()) return;
  setSetting("company_name", "Northwind Labs");

  const slack = ensureSource("slack", "Northwind Slack (demo)", { demo: 1 });
  const email = ensureSource("email", "Leadership inbox (demo)", { demo: 1 });
  const staff = ensureSource("staff", "Staff interviews", { demo: 1 });
  ingestDocuments(slack.id, SLACK);
  ingestDocuments(email.id, EMAIL);
  ingestDocuments(staff.id, STAFF);

  const docIds = new Map<string, number>();
  for (const [src, docs] of [[slack.id, SLACK], [email.id, EMAIL], [staff.id, STAFF]] as const) {
    for (const doc of docs) {
      const row = get<{ id: number }>("SELECT id FROM documents WHERE source_id = ? AND external_id = ?", src, doc.externalId);
      if (row) docIds.set(doc.externalId, row.id);
    }
  }

  TOPIC_ORDER.forEach((name, i) => {
    const t = ensureTopic(name);
    run("UPDATE topics SET position = ? WHERE id = ?", i, t.id);
  });

  const ids = new Map<string, number>();
  for (const e of ENTRIES) {
    const topic = ensureTopic(e.topic);
    const id = createEntry({
      topicId: topic.id,
      type: e.type,
      title: e.title,
      body: e.body,
      confidence: e.confidence,
      status: e.status ?? "approved",
      origin: e.origin ?? "ai",
      owner: e.owner ?? null,
    });
    ids.set(e.title, id);
    for (const [ext, quote] of e.evidence) {
      const docId = docIds.get(ext);
      if (docId) addEvidence(id, docId, quote);
    }
  }

  // The July refund thread said 14 days; Claude flagged the October change as an update.
  // Leave one live conflict to show the review flow: an AE pasted an old discount rule.
  const stale = createEntry({
    topicId: ensureTopic("Sales").id,
    type: "policy",
    title: "AE discount limit (older guidance)",
    body: "AEs can give up to 20% on annual deals without approval.",
    confidence: 0.55,
    status: "pending",
  });
  const oldSalesDoc = docIds.get("sales:0");
  if (oldSalesDoc) addEvidence(stale, oldSalesDoc, "can we just do 20% on annual deals without asking? … going with 20% unless someone objects");
  createConflict(
    ids.get("Discount approval levels")!,
    stale,
    "A March #sales thread says AEs can give 20% on annual deals without approval; Jonas Weber's August message sets the limit at 15%, with 15–25% needing his approval.",
  );

  markProcessed([...docIds.values()]);

  upsertQuestion({
    question: "What is the escalation path when the on-call engineer doesn't acknowledge a page within 15 minutes?",
    topicId: ensureTopic("Incidents & Reliability").id,
    assignee: "Priya Raman",
    origin: "ai",
  });
  upsertQuestion({
    question: "Can support extend a trial beyond 14 days, and who approves it?",
    topicId: ensureTopic("Customer Support").id,
    assignee: "Ana Souza",
    origin: "gap",
    context: 'An agent asked: "can I extend a customer\'s trial?" and nothing in the knowledge base answered it.',
  });
  upsertQuestion({
    question: "Which plan includes SSO/SAML, and is it a paid add-on?",
    topicId: ensureTopic("Sales").id,
    assignee: "Jonas Weber",
    origin: "agent",
  });

  for (const name of TOPIC_ORDER) {
    const t = ensureTopic(name);
    const s = DEMO_SUMMARIES[name];
    // Summaries cite entries by their position in ENTRIES; map to real ids.
    if (s) updateTopicSummary(t.id, s.replace(/\[E(\d+)\]/g, (_m, n) => `[E${ids.get(ENTRIES[Number(n) - 1].title)}]`));
  }
  logActivity(actor, "loaded demo workspace", "Northwind Labs: 11 Slack threads, 4 email threads, 2 staff interviews");
}

const DEMO_SUMMARIES: Record<string, string> = {
  "Customer Support": `Support answers customers on behalf of Northwind Labs. Agents here mostly field data-export questions and privacy requests; get the admin checks right because they protect customer data.

### Rules agents must follow
- Only org admins can export raw events or request data deletion; verify admin status in Lighthouse first [E8] [E9].
- Never delete customer data by hand. Every GDPR deletion goes through a \`gdpr-delete\` Linear ticket [E9].

### How things get done
- Raw event export: Settings → Data → Export, CSV or Parquet; over 10M rows goes to the customer's S3 bucket [E8].
- GDPR deletion: verify admin → Linear ticket → reply with the ticket number; engineering deletes within 7 days [E9].

### Who to ask
- Ana Souza leads support. Marcus Lee owns data deletion.`,
  "Billing & Refunds": `Refunds and invoices. The refund window changed recently, so agents must use the current rule.

### Rules agents must follow
- Full refunds within **30 days** of purchase can be approved by support, any plan [E6].
- After 30 days: prorated, Finance approves. Over €2,000: always Lena Fischer [E6].

### How things get done
- Billing questions go to billing@northwind.io; replies within 2 business days. Invoices arrive on the 1st via Stripe [E7].

### Watch out for
- Until 2026-10-01 the refund window was 14 days. Older Slack threads and macros may still say 14.`,
  Sales: `Pricing, discounts and packaging for AEs and sales assistants.

### Rules agents must follow
- Discounts on annual deals: up to 15% AE, 15–25% Jonas Weber in HubSpot, over 25% CEO. Never discount monthly plans [E10].
- Startup program: 50% off year one with \`STARTUP50\`, no approval, for companies under 20 people and under $5M raised [E11].
- Beacon Edge is Enterprise-only from Q4 2026; existing Growth users keep it until renewal [E12].

### Watch out for
- An open conflict: one source claims a 20% AE limit. The approved rule is 15% until the conflict is resolved.`,
  "Engineering Workflow": `How code reaches production and where to test it.

### Rules agents must follow
- Hotfixes branch from \`release\`, need the on-call engineer's approval, and are cherry-picked back to \`main\` the same day [E1].
- No hotfixes on Fridays after 15:00 Berlin time unless Sev1 [E1].

### How things get done
- Staging: staging.beacon-internal.dev, test org \`acme-demo\`, resets Sundays 02:00 UTC [E2].
- New engineers ship a PR in week one and join on-call after six weeks [E3].

### Who to ask
- Priya Raman (engineering process), Marcus Lee (infrastructure).`,
  "Incidents & Reliability": `What counts as an incident, who gets paged, and what customers are promised.

### Rules agents must follow
- Sev1: page on-call now, status page within 15 min, tell the CTO. Sev2: page, status page within 30 min. Sev3: Linear ticket only [E4].
- Enterprise: 99.9% uptime, Sev1 first response within 1 hour 24/7. Growth has no SLA [E5].
- Service credits are capped at 30% and are never paid in cash [E5].

### Who to ask
- The on-call incident commander; Ana Souza for customer communication.`,
  "Security & Compliance": `What agents may say about security and where to route questionnaires.

### Rules agents must follow
- Share the SOC 2 Type II report only under NDA [E13].
- Customer data lives in AWS eu-central-1 (Frankfurt) [E13].

### Who to ask
- Marcus Lee via security@northwind.io for every security questionnaire [E13].`,
  "People & Policies": `Internal policies for employees: expenses and time off.

### Rules agents must follow
- Expenses go into Pleo within 30 days with a receipt; anything over €1,000 needs department-head pre-approval [E14].
- 28 vacation days plus public holidays; request leaves over 3 days two weeks ahead in Personio [E15].`,
  "Company Glossary": `Internal vocabulary agents will meet in tickets and chat.

- **Beacon** is the product, **Beacon Edge** the self-hosted collector, **MTU** the billing unit, **Lighthouse** the support admin tool [E16].`,
};
