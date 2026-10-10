import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/auth-forms";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

function safeCallback(url: string | undefined) {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/app";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  const callbackUrl = safeCallback(sp.callbackUrl);
  if (session?.user?.id) redirect(callbackUrl);
  return <LoginForm googleEnabled={env.googleEnabled()} callbackUrl={callbackUrl} error={sp.error} />;
}
