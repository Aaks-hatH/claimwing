"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, Trash2, Users } from "lucide-react";
import { REPORT_INFO, REPORT_TYPES, type AggregateResult, type ReportType } from "@/lib/ripple/reports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/primitives";
import { Term } from "@/components/help/term";
import { cn } from "@/lib/utils";
import { ago } from "./format";

const LEVEL_TONE = { strong: "success", some: "info", unverified: "neutral", contested: "warning", faded: "neutral" } as const;
const SOURCE_LABEL = { passengers: "Reported by passengers", official: "Official data", aircraft: "Aircraft data", simulation: "Simulated passengers", mixed: "Passengers and official data" } as const;

/** Aggregated observations. New ones slide in; nothing here identifies who reported what. */
export function ActivityFeed({ reports, now }: { reports: AggregateResult; now: Date }) {
  if (!reports.claims.length) {
    return (
      <div className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
        <Users className="mx-auto mb-2 size-5" aria-hidden />
        No observations yet. If you&apos;re at the airport or on board, your report helps everyone on this flight.
      </div>
    );
  }
  return (
    <div>
      <ul className="space-y-2" aria-live="off">
        <AnimatePresence initial={false}>
          {reports.claims.map((c) => (
            <motion.li
              key={c.type}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={cn("rounded-xl border bg-card p-3", c.level === "faded" && "opacity-70")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {c.sentence}
                  {c.value !== null && <span className="text-muted-foreground">{typeof c.value === "number" ? ` (about ${c.value} min)` : ` (gate ${c.value})`}</span>}
                </p>
                <Badge tone={LEVEL_TONE[c.level]}>{c.levelLabel}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {SOURCE_LABEL[c.source]} · {c.contributorsLabel} · last {ago(c.lastAt, now)}
              </p>
              {c.level === "contested" && <p className="mt-1 text-xs text-warning">Other reports disagree with this, so it counts for less.</p>}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {reports.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {reports.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Reports are observations, not airline announcements. See how <Term id="corroboration">corroboration</Term> works.
      </p>
    </div>
  );
}

const WHEN = [
  { v: "0", label: "Just now" },
  { v: "5", label: "About 5 min ago" },
  { v: "10", label: "About 10 min ago" },
  { v: "20", label: "About 20 min ago" },
  { v: "40", label: "About 40 min ago" },
];

export type SubmitReport = (input: { type: ReportType; observedAt: string | null; value: string | number | null; note: string | null }) => Promise<void>;

/** Structured reporting: pick what you saw, optionally add a gate or announced delay. */
export function ReportForm({ onSubmit, disabledReason, compact = false }: { onSubmit: SubmitReport; disabledReason?: React.ReactNode; compact?: boolean }) {
  const [type, setType] = useState<ReportType | null>(null);
  const [when, setWhen] = useState("0");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = type ? REPORT_INFO[type].value : undefined;

  if (disabledReason) {
    return <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">{disabledReason}</div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || pending) return;
    setError(null);
    if (kind === "minutes" && value && !/^\d+$/.test(value)) return setError("Enter the announced delay as a number of minutes.");
    setPending(true);
    try {
      await onSubmit({
        type,
        observedAt: when === "0" ? null : new Date(Date.now() - Number(when) * 60_000).toISOString(),
        value: value ? (kind === "minutes" ? Number(value) : value) : null,
        note: note.trim() || null,
      });
      setType(null);
      setValue("");
      setNote("");
      setWhen("0");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your report wasn't sent. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="text-sm font-medium">What did you see?</legend>
        <div className={cn("mt-2 grid gap-1.5", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
          {REPORT_TYPES.map((t) => (
            <label
              key={t}
              className={cn(
                "cursor-pointer rounded-xl border px-2.5 py-2 text-xs leading-snug transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                type === t ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              <input type="radio" name="report-type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
              {REPORT_INFO[t].label}
            </label>
          ))}
        </div>
      </fieldset>
      {type && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3 overflow-hidden">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="report-when">When</Label>
              <NativeSelect id="report-when" value={when} onChange={(e) => setWhen(e.target.value)}>
                {WHEN.map((w) => (
                  <option key={w.v} value={w.v}>
                    {w.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {kind && (
              <div className="space-y-1.5">
                <Label htmlFor="report-value">{kind === "gate" ? "New gate (optional)" : "Announced delay in minutes (optional)"}</Label>
                <Input id="report-value" inputMode={kind === "minutes" ? "numeric" : "text"} value={value} onChange={(e) => setValue(e.target.value.slice(0, 5))} placeholder={kind === "gate" ? "B32" : "45"} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-note">Note (optional, shown only to you)</Label>
            <Textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 140))} rows={2} placeholder="Anything that helps you remember it" />
            <p className="text-right text-[11px] text-muted-foreground">{note.length}/140</p>
          </div>
        </motion.div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!type || pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {pending ? "Sharing" : "Share observation"}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Others following this flight see a summary like &ldquo;2 people, 4 min ago&rdquo;, never your name, email or booking.
      </p>
    </form>
  );
}

export type MyReport = { id: string; label: string; createdAt: string; value: string | number | null; note: string | null; moderation: string; withdrawn: boolean };

export function MyReports({ reports, onDelete, now }: { reports: MyReport[]; onDelete?: (id: string) => Promise<void>; now: Date }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!reports.length) return null;
  return (
    <div>
      <p className="text-sm font-medium">Your reports on this flight</p>
      <ul className="mt-2 divide-y rounded-xl border">
        {reports.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p>
                {r.label}
                {r.value !== null ? ` (${r.value})` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {ago(r.createdAt, now)}
                {r.moderation === "flagged" ? ". Flagged by automatic checks, so it counts for less" : ""}
                {r.withdrawn ? ". Not shared (sharing is off)" : ""}
              </p>
              {r.note && <p className="mt-1 truncate text-xs text-muted-foreground">Note: {r.note}</p>}
            </div>
            {onDelete && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete your report: ${r.label}`}
                disabled={busy === r.id}
                onClick={async () => {
                  setBusy(r.id);
                  try {
                    await onDelete(r.id);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === r.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
