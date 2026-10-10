import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupWizard } from "@/components/auth/signup-wizard";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  const cb = sp.callbackUrl && sp.callbackUrl.startsWith("/") && !sp.callbackUrl.startsWith("//") ? sp.callbackUrl : "/app";
  if (session?.user?.id) redirect(cb);
  return <SignupWizard callbackUrl={cb} />;
}
