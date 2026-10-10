import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, CircleDashed } from "lucide-react";
import type { Readiness } from "@/lib/claim-readiness";
import { formatLocal } from "@/lib/time";
import { cn } from "@/lib/utils";

const ICON = { done: CheckCircle2, missing: Circle, warning: AlertTriangle, optional: CircleDashed } as const;
const TONE = { done: "text-success", missing: "text-danger", warning: "text-warning", optional: "text-muted-foreground" } as const;
const STATUS_TEXT = { done: "Done", missing: "Missing", warning: "Check", optional: "Optional" } as const;

/** Claim readiness checklist: progress from real completion, with a way to fix every gap. */
export function ClaimReadiness({ r }: { r: Readiness }) {
  const pct = r.required ? Math.round((r.done / r.required) * 100) : 100;
  const missing = r.items.filter((i) => i.status === "missing" && i.required).length;
  return (
    <section className="rounded-3xl border bg-card p-5 sm:p-6" aria-labelledby="readiness-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="readiness-title" className="text-2xl">
            Claim readiness
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{missing ? `${missing} thing${missing === 1 ? "" : "s"} to add before you send it.` : "Everything required is in place. Preview the packet, then download it."}</p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {r.done} of {r.required} required
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={r.required} aria-valuenow={r.done} aria-label="Required items completed">
        <div className={cn("h-full rounded-full transition-[width] duration-700", missing ? "bg-signal" : "bg-success")} style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-5 divide-y">
        {r.items.map((i) => {
          const Icon = ICON[i.status];
          return (
            <li key={i.id} className="flex flex-wrap items-start gap-3 py-3">
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[i.status])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {i.label} <span className="sr-only">({STATUS_TEXT[i.status]})</span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{i.why}</p>
              </div>
              {i.fix && (
                <Link href={i.fix.href} className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary">
                  {i.fix.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {(r.deadlines.length > 0 || r.timeLimitNote) && (
        <div className="mt-4 rounded-2xl bg-muted/50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4 text-signal" aria-hidden /> Deadlines
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {r.deadlines.map((d) => (
              <li key={d.label} className={cn(d.passed ? "text-danger" : "text-muted-foreground")}>
                <span className="font-medium text-foreground">{d.label}</span>: {d.dueAt ? formatLocal(d.dueAt, null, { withZone: false }) : "no date"}
                {d.passed ? " (passed)" : ""}. {d.basis}
                {d.hard ? ". Missing it can defeat the claim." : ""}
              </li>
            ))}
            {r.timeLimitNote && <li className="text-muted-foreground">{r.timeLimitNote}</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
