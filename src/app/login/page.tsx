import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { loginAction } from "@/app/actions";
import { AuthFrame } from "@/app/auth-frame";
import { Notice, SubmitButton } from "@/components/client";
import { Field, inputCls } from "@/components/ui";
import { currentUser, userCount } from "@/lib/auth";
import { bootstrap, DEMO } from "@/lib/bootstrap";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  bootstrap();
  if (await currentUser()) redirect("/dashboard");
  if (userCount() === 0) redirect("/setup");
  const next = (await searchParams).next;

  return (
    <AuthFrame
      title="Sign in"
      aside={
        DEMO.enabled ? (
          <p>
            Demo workspace: <code className="font-mono">{DEMO.email}</code> / <code className="font-mono">{DEMO.password}</code>
          </p>
        ) : (
          <p>
            New here? Ask a workspace admin to add you. <Link href="/" className="underline">What is Company Brain?</Link>
          </p>
        )
      }
    >
      <Suspense>
        <Notice />
      </Suspense>
      <form action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" defaultValue={DEMO.enabled ? DEMO.email : ""} className={inputCls} />
        </Field>
        <Field label="Password">
          <input name="password" type="password" required autoComplete="current-password" defaultValue={DEMO.enabled ? DEMO.password : ""} className={inputCls} />
        </Field>
        <SubmitButton className="w-full" pending="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthFrame>
  );
}
