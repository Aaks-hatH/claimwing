"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import type { TripView } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { TripRow } from "./trip-row";

export type FlightItem = { trip: TripView; delay: number | null; eligibility: "eligible" | "not_eligible" | "needs_review" | null };
type Phase = "active" | "upcoming" | "disrupted" | "completed";

/** Where a flight is in its life, from recorded state only (never from a forecast). */
export function phaseOf(i: FlightItem, now: number): Phase[] {
  const t = i.trip;
  const dep = new Date(t.scheduledDeparture).getTime();
  const arr = new Date(t.scheduledArrival).getTime();
  const est = t.estimatedArrival ? new Date(t.estimatedArrival).getTime() : null;
  const out: Phase[] = [];
  const recordedLate = (i.delay ?? 0) >= 15 || t.status === "cancelled" || t.status === "diverted" || (est !== null && (est - arr) / 60_000 >= 15);
  if (recordedLate) out.push("disrupted");
  if (t.status === "in_air" || (!t.finalized && now > dep - 3 * 3600_000 && now < Math.max(arr, est ?? 0) + 6 * 3600_000)) out.push("active");
  else if (now < dep) out.push("upcoming");
  else out.push("completed");
  return out;
}

const FILTERS: Array<{ id: "all" | Phase; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "upcoming", label: "Upcoming" },
  { id: "disrupted", label: "Disrupted" },
  { id: "completed", label: "Completed" },
];

export function FlightFilter({ items, now, emptyText = "No flights here yet." }: { items: FlightItem[]; now: number; emptyText?: string }) {
  const [filter, setFilter] = useState<"all" | Phase>("all");
  const [q, setQ] = useState("");
  const phases = useMemo(() => new Map(items.map((i) => [i.trip.id, phaseOf(i, now)])), [items, now]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const p of phases.values()) for (const x of p) c[x] = (c[x] ?? 0) + 1;
    return c;
  }, [items, phases]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => {
      if (filter !== "all" && !phases.get(i.trip.id)?.includes(filter)) return false;
      if (!s) return true;
      const t = i.trip;
      return `${t.flightNumber} ${t.airlineName} ${t.origin.iata} ${t.destination.iata} ${t.origin.city ?? ""} ${t.destination.city ?? ""} ${t.flightDate}`.toLowerCase().includes(s);
    });
  }, [items, filter, q, phases]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter flights">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors", filter === f.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}
            >
              {f.label}
              <span className="ml-1 tabular-nums opacity-70">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="relative block sm:w-60">
          <span className="sr-only">Search flights</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Flight, airport or date"
            className="h-9 w-full rounded-full border bg-card pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          )}
        </label>
      </div>
      <div className="mt-2 divide-y" aria-live="polite">
        <AnimatePresence initial={false}>
          {shown.map((r) => (
            <motion.div key={r.trip.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <TripRow trip={r.trip} delayMinutes={r.delay} eligibility={r.eligibility} />
            </motion.div>
          ))}
        </AnimatePresence>
        {!shown.length && <p className="py-10 text-sm text-muted-foreground">{q ? `No flights match "${q}".` : emptyText}</p>}
      </div>
    </div>
  );
}
