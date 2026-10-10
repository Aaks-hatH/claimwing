import Link from "next/link";
import { ArrowUpRight, Plane } from "lucide-react";
import type { TripView } from "@/lib/dal";
import { formatDuration, formatLocal, minutesBetween, nowMs } from "@/lib/time";
import { StatusBadge } from "@/components/ui/feedback";
import { flightStatusKey } from "@/components/trips/trip-row";

function when(trip: TripView) {
  const now = nowMs();
  const dep = new Date(trip.scheduledDeparture).getTime();
  const arr = new Date(trip.scheduledArrival).getTime();
  if (trip.status === "in_air") return "In the air now";
  if (trip.status === "landed" || trip.finalized) return "Landed";
  if (now > arr) return "Arrival window passed";
  if (now >= dep) return "Departing now";
  const mins = minutesBetween(new Date(now), new Date(dep));
  if (mins < 60 * 48) return `Departs in ${formatDuration(mins)}`;
  return `Departs in ${Math.round(mins / 1440)} days`;
}

/** The flight that matters right now: big airport codes on one thin arc. No boxes, no chrome. */
export function NextFlight({ trip, label = "Next flight" }: { trip: TripView; label?: string }) {
  const inAir = trip.status === "in_air";
  return (
    <Link
      href={`/app/trips/${trip.id}?tab=flight`}
      className="group relative block overflow-hidden rounded-[2rem] border bg-gradient-to-b from-sky/70 to-card px-6 py-9 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-signal/40 sm:px-12 sm:py-12"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow text-[11px] text-muted-foreground">{label}</p>
        <div className="flex items-center gap-3">
          <StatusBadge status={flightStatusKey(trip, null)} />
          <ArrowUpRight className="size-5 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-signal" aria-hidden />
        </div>
      </div>

      <div className="mt-10 grid grid-cols-[auto_1fr_auto] items-end gap-4 sm:gap-8">
        <div>
          <p className="font-display text-6xl font-light leading-none tracking-tight sm:text-8xl">{trip.origin.iata}</p>
          <p className="mt-3 text-sm text-muted-foreground">{trip.origin.city ?? trip.origin.name}</p>
        </div>
        <div className="relative mb-9 h-10 sm:mb-14" aria-hidden>
          <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="arc-draw absolute inset-0 size-full overflow-visible">
            <path d="M0 38 Q100 -18 200 38" fill="none" stroke="var(--signal)" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <Plane className={`plane-fly absolute size-5 text-signal ${inAir ? "plane-fly-live" : ""}`} />
        </div>
        <div className="text-right">
          <p className="font-display text-6xl font-light leading-none tracking-tight sm:text-8xl">{trip.destination.iata}</p>
          <p className="mt-3 text-sm text-muted-foreground">{trip.destination.city ?? trip.destination.name}</p>
        </div>
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-signal/15 pt-6 text-sm sm:grid-cols-4">
        <div>
          <dt className="eyebrow text-[10px] text-muted-foreground">Flight</dt>
          <dd className="mt-1.5 font-mono font-medium">{trip.flightNumber}</dd>
        </div>
        <div>
          <dt className="eyebrow text-[10px] text-muted-foreground">Departs</dt>
          <dd className="mt-1.5">{formatLocal(trip.scheduledDeparture, trip.origin.tz, { withZone: false })}</dd>
        </div>
        <div>
          <dt className="eyebrow text-[10px] text-muted-foreground">Arrives</dt>
          <dd className="mt-1.5">{formatLocal(trip.estimatedArrival ?? trip.scheduledArrival, trip.destination.tz, { withZone: false })}</dd>
        </div>
        <div>
          <dt className="eyebrow text-[10px] text-muted-foreground">Status</dt>
          <dd className="mt-1.5 text-signal">{when(trip)}</dd>
        </div>
      </dl>
    </Link>
  );
}
