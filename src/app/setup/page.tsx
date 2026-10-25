import { redirect } from "next/navigation";
import { Suspense } from "react";
import { setupAction } from "@/app/actions";
import { AuthFrame } from "@/app/auth-frame";
import { Notice, SubmitButton } from "@/components/client";
import { Field, inputCls } from "@/components/ui";
import { userCount } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";

export const metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  bootstrap();
  if (userCount() > 0) redirect("/login");
  return (
    <AuthFrame title="Start your brain" aside="You'll be the workspace admin. You can invite teammates afterwards.">
      <Suspense>
        <Notice />
      </Suspense>
      <form action={setupAction} className="space-y-4">
        <Field label="Company name">
          <input name="company" required placeholder="Acme Inc." className={inputCls} />
        </Field>
        <Field label="Your name">
          <input name="name" required autoComplete="name" className={inputCls} />
        </Field>
        <Field label="Work email">
          <input name="email" type="email" required autoComplete="email" className={inputCls} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input name="password" type="password" minLength={8} required autoComplete="new-password" className={inputCls} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" name="demo" className="mt-1 accent-[var(--signal)]" />
          <span>Load a demo company (Northwind Labs) so I can look around first</span>
        </label>
        <SubmitButton className="w-full" pending="Creating…">
          Create workspace
        </SubmitButton>
      </form>
    </AuthFrame>
  );
}
