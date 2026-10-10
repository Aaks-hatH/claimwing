import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarClock, FileText, Plus } from "lucide-react";
import type { dashboardData } from "@/lib/dal";
import { formatMoneyList } from "@/lib/format";
import { formatLocal, daysUntil } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/feedback";
import { TripRow } from "@/components/trips/trip-row";
import { DemoTripButton } from "@/components/trips/demo-trip-button";
import { ClaimsChart } from "@/components/claim/claims-chart";
import { NextFlight } from "./next-flight";

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;

export function DashboardView({ d, first, demoEnabled }: { d: DashboardData; first: string; demoEnabled: boolean }) {
  const nearestDays = d.nearest ? daysUntil(d.nearest.dueAt) : null;
  const hero = d.upcoming[0] ?? d.recent[0]?.trip ?? null;
  const heroIsNext = Boolean(d.upcoming[0]);
  const recentById = new Map(d.recent.map((r) => [r.trip.id, r]));
  const rows: Array<{ trip: (typeof d.recent)[number]["trip"]; delay: number | null; status: (typeof d.recent)[number]["status"] }> = [];
  for (const t of [...d.upcoming, ...d.recent.map((r) => r.trip)]) {
    if (t.id === hero?.id || rows.some((r) => r.trip.id === t.id)) continue;
    const r = recentById.get(t.id);
    rows.push({ trip: t, delay: r?.outcome?.delayMinutes ?? null, status: r?.status ?? null });
  }

  return (
    <div className="space-y-14 md:space-y-20">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-[11px] text-muted-foreground">{formatLocal(new Date(), null, { withZone: false, withDate: true }).split(",")[0]}</p>
          <h1 className="mt-3 text-4xl tracking-tight sm:text-6xl">
            Hello, <em className="font-light italic text-signal">{first}.</em>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoTripButton variant="ghost" enabled={demoEnabled} />
          <Button asChild variant="outline">
            <Link href="/app/trips/new">
              <Plus /> Add a trip
            </Link>
          </Button>
        </div>
      </section>

      {hero && <NextFlight trip={hero} label={heroIsNext ? "Next flight" : "Last flight"} />}

      {d.nearest && nearestDays !== null && nearestDays <= 3 && (
        <section className="flex flex-col gap-4 rounded-2xl bg-warning-soft px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="font-medium">
                {d.nearest.label} due {formatLocal(d.nearest.dueAt, null, { withZone: false })}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Missing this deadline can defeat your baggage claim. Send it in writing to the airline.</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/trips/${d.nearest.tripId}/baggage/${d.nearest.bagId}`}>Open bag</Link>
          </Button>
        </section>
      )}

      <section className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-4">
        <Stat
          label="Identified"
          value={formatMoneyList(d.potential) ?? "—"}
          hint={d.eligibleTrips.length ? `${d.eligibleTrips.length} flight${d.eligibleTrips.length > 1 ? "s" : ""}, lowest likely amounts` : "No eligible flights yet"}
        />
        <Stat label="In progress" value={d.inProgress} hint={d.drafts ? `${d.drafts} draft${d.drafts > 1 ? "s" : ""} not sent yet` : "Ready, sent or awaiting reply"} />
        <Stat label="Recovered" value={formatMoneyList(d.recovered) ?? "—"} hint="From claims marked paid" />
        <Stat
          label="Next deadline"
          value={d.nearest ? (nearestDays! < 1 ? "Today" : `${Math.floor(nearestDays!)} day${Math.floor(nearestDays!) === 1 ? "" : "s"}`) : "—"}
          hint={d.nearest ? `${d.nearest.label} · ${d.nearest.description}` : "No open baggage deadlines"}
        />
      </section>

      <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-24">
        <section>
          <div className="flex items-baseline justify-between border-b pb-4">
            <h2 className="text-2xl">Flights</h2>
            <Link href="/app/trips" className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-signal">
              All trips <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {rows.length ? (
            <div className="divide-y" data-stagger>
              {rows.map((r) => (
                <TripRow key={r.trip.id} trip={r.trip} delayMinutes={r.delay} eligibility={r.status} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-sm text-muted-foreground">Your other flights will appear here.</p>
          )}
        </section>

        <aside className="space-y-14">
          {d.eligibleTrips.length > 0 && (
            <section>
              <h2 className="border-b pb-4 text-2xl">Worth claiming</h2>
              <ul className="divide-y" data-stagger>
                {d.eligibleTrips.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link href={`/app/trips/${e.id}?tab=claim`} className="group block py-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{e.flight}</span>
                        <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-signal" aria-hidden />
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{e.summary}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="border-b pb-4 text-2xl">Claims</h2>
            <div className="pt-4">
              {d.claimsByStatus.some((c) => c.count) ? (
                <ClaimsChart data={d.claimsByStatus} />
              ) : (
                <p className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
                  <FileText className="size-4 shrink-0" aria-hidden />
                  Claims you start will show up here.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>

    </div>
  );
}
