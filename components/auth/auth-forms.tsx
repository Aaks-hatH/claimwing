"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Separator } from "@/components/ui/primitives";
import { Alert, FieldError } from "@/components/ui/feedback";

function GoogleButton({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      loading={busy}
      onClick={() => {
        setBusy(true);
        signIn("google", { callbackUrl });
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
      </svg>
      Continue with Google
    </Button>
  );
}

const loginSchema = z.object({ email: z.email("Enter a valid email"), password: z.string().min(1, "Enter your password") });

export function LoginForm({ googleEnabled, callbackUrl, error }: { googleEnabled: boolean; callbackUrl: string; error?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(error ? "Sign-in failed. Please try again." : null);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setFormError(null);
    const res = await signIn("credentials", { ...values, redirect: false });
    if (!res || res.error) {
      setFormError(
        res?.code === "rate_limited"
          ? "Too many attempts. Wait 15 minutes and try again."
          : "That email and password don't match an account.",
      );
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription>Welcome back. Your trips and evidence are waiting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleEnabled && (
          <>
            <GoogleButton callbackUrl={callbackUrl} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" /> or <Separator className="flex-1" />
            </div>
          </>
        )}
        {formError && <Alert tone="danger" title={formError} />}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
            <FieldError message={form.formState.errors.email?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register("password")} />
            <FieldError message={form.formState.errors.password?.message} />
          </div>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Sign in
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href={`/signup${callbackUrl !== "/app" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Use letters and at least one number"),
  accept: z.literal(true, { error: "Please accept the terms to continue" }),
});

export function SignupForm({ googleEnabled, callbackUrl }: { googleEnabled: boolean; callbackUrl: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", accept: false as unknown as true },
  });

  async function onSubmit(values: z.input<typeof signupSchema>) {
    setFormError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: values.name, email: values.email, password: values.password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? "Couldn't create your account. Please try again.");
      return;
    }
    const login = await signIn("credentials", { email: values.email, password: values.password, redirect: false });
    if (login?.error) {
      router.push("/login");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  const e = form.formState.errors;
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Create your account</CardTitle>
        <CardDescription>Free. Your photos and flight data stay private to you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleEnabled && (
          <>
            <GoogleButton callbackUrl={callbackUrl} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" /> or <Separator className="flex-1" />
            </div>
          </>
        )}
        {formError && <Alert tone="danger" title={formError} />}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" autoComplete="name" aria-invalid={!!e.name} {...form.register("name")} />
            <FieldError message={e.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!e.email} {...form.register("email")} />
            <FieldError message={e.email?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!e.password} {...form.register("password")} />
            <FieldError message={e.password?.message ?? undefined} />
            {!e.password && <p className="text-xs text-muted-foreground">At least 10 characters, with letters and a number.</p>}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" {...form.register("accept")} />
            <span className="text-muted-foreground">
              I agree to the <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy notice</Link>, and understand ClaimWing is not legal advice.
            </span>
          </label>
          <FieldError message={e.accept?.message} />
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Create account
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
