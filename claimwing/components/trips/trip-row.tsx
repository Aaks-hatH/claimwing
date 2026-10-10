import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { TripView } from "@/lib/dal";
import { formatDuration, formatLocal } from "@/lib/time";
import { Badge, StatusBadge, type StatusKey } from "@/components/ui/feedback";

export function flightStatusKey(trip: Pick<TripView, "status">, delayMinutes: number | null | undefined): StatusKey {
  if (trip.status === "cancelled") return "cancelled";
  if (trip.status === "diverted") return "diverted";
  if (trip.status === "in_air") return "in_air";
  if (trip.status === "landed" || delayMinutes != null) return delayMinutes != null && delayMinutes >= 15 ? "delayed" : delayMinutes != null ? "on_time" : "landed";
  return "scheduled";
}

export function TripRow({
  trip,
  delayMinutes,
  eligibility,
}: {
  trip: TripView;
  delayMinutes?: number | null;
  eligibility?: "eligible" | "not_eligible" | "needs_review" | null;
}) {
  return (
    <Link href={`/app/trips/${trip.id}`} className="group grid grid-cols-[1fr_auto] items-center gap-4 py-5 transition-colors sm:grid-cols-[8rem_1fr_auto]">
      <div className="hidden sm:block">
        <p className="font-mono text-sm font-semibold tracking-wide">{trip.flightNumber}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{trip.airlineName}</p>
      </div>
      <div className="min-w-0">
        <p className="font-display text-2xl tracking-tight">
          {trip.origin.iata}
          <span className="mx-2.5 text-signal" aria-hidden>
            &rarr;
          </span>
          <span className="sr-only"> to </span>
          {trip.destination.iata}
          {trip.demoMode && (
            <Badge tone="info" className="ml-3 align-middle">
              Demo replay
            </Badge>
          )}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          <span className="sm:hidden">{trip.flightNumber} · </span>
          {formatLocal(trip.scheduledDeparture, trip.origin.tz, { withZone: false })}
          {delayMinutes != null && delayMinutes >= 15 ? ` · ${formatDuration(delayMinutes)} late` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center">
          <StatusBadge status={flightStatusKey(trip, delayMinutes)} />
          {eligibility && eligibility !== "not_eligible" && <StatusBadge status={eligibility} />}
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-signal group-hover:opacity-100 max-sm:hidden" aria-hidden />
      </div>
    </Link>
  );
}
