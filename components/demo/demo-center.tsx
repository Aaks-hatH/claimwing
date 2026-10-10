"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Briefcase, CloudOff, FileText, GitBranch, Repeat, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { RippleScenario } from "./ripple-scenario";
import { BagScenario } from "./bag-scenario";
import { ClaimScenario } from "./claim-scenario";

export type ScenarioCard = { id: string; title: string; summary: string; expected: string; kind: "ripple" | "bag" | "claim"; highlight?: number };

const ICONS = { cascade: GitBranch, reports: Users, swap: Repeat, stale: CloudOff, bag: Briefcase, claim: FileText } as Record<string, typeof GitBranch>;

export function DemoCenter({ scenarios }: { scenarios: ScenarioCard[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const current = scenarios.find((s) => s.id === sp.get("s")) ?? scenarios[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <nav aria-label="Scenarios" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {scenarios.map((s, i) => {
            const Icon = ICONS[s.id] ?? GitBranch;
            const active = s.id === current.id;
            return (
              <li key={s.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => router.replace(`?s=${s.id}`, { scroll: false })}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative flex w-60 items-start gap-3 rounded-2xl border p-3 text-left transition-colors lg:w-full",
                    active ? "border-foreground bg-card" : "hover:bg-card",
                  )}
                >
                  {active && <motion.span layoutId="demo-active" className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-signal" aria-hidden />}
                  <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-signal" : "text-muted-foreground")} aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">
                      {i + 1}. {s.title}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 space-y-5">
        <h2 className="text-3xl">{current.title}</h2>
        {current.kind === "ripple" && <RippleScenario key={current.id} id={current.id} highlight={current.highlight} />}
        {current.kind === "bag" && <BagScenario key="bag" />}
        {current.kind === "claim" && <ClaimScenario key="claim" />}
      </div>
    </div>
  );
}
