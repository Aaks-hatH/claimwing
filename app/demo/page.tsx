import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FlaskConical } from "lucide-react";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { SCENARIOS } from "@/lib/ripple/sim/scenarios";
import { DemoCenter, type ScenarioCard } from "@/components/demo/demo-center";

export const metadata: Metadata = { title: "Demo", description: "Simulated Vola walkthroughs." };

const HIGHLIGHT: Record<string, number> = { cascade: 5, reports: 2, swap: 1, stale: 2 };

export default async function DemoPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const scenarios: ScenarioCard[] = [
    ...SCENARIOS.map((s) => ({ id: s.id, title: s.title, summary: s.summary, expected: s.expected, kind: "ripple" as const, highlight: HIGHLIGHT[s.id] })),
    {
      id: "bag",
      title: "Bag damage",
      summary: "Compare two photos of one bag.",
      expected: "Heatmap. Confirm or reject each region.",
      kind: "bag",
    },
    {
      id: "claim",
      title: "Claim",
      summary: "From delay to a verified claim.",
      expected: "Eligibility, letter, verified export.",
      kind: "claim",
    },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Logo href={signedIn ? "/app" : "/"} />
            <span className="hidden items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning sm:inline-flex">
              <FlaskConical className="size-3.5" aria-hidden /> Simulated
            </span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={signedIn ? "/app" : "/"}>{signedIn ? "My trips" : "Home"}</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 md:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning sm:hidden">
            <FlaskConical className="size-3.5" aria-hidden /> Simulated
          </p>
          <h1 className="mt-3 text-4xl sm:text-5xl">Demo</h1>
        </div>
        <Suspense>
          <DemoCenter scenarios={scenarios} />
        </Suspense>
      </main>
    </div>
  );
}
