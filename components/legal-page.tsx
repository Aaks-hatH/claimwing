import Link from "next/link";
import { Logo } from "@/components/brand";
import { Alert } from "@/components/ui/feedback";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated {updated}</p>
        <Alert tone="warning" className="mt-6" title="Draft for review">
          This text describes how the software actually works. The operator of this service must review it with a qualified adviser and add their legal name, contact details and jurisdiction before relying on it.
        </Alert>
        <div className="mt-8 space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">{children}</div>
        <p className="mt-10 text-sm">
          <Link href="/" className="underline">
            Back to Vola
          </Link>
        </p>
      </main>
    </div>
  );
}
