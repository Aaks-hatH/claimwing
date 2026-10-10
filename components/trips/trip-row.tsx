import Link from "next/link";
import { ChevronRight, Plane } from "lucide-react";
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
    <Link href={`/app/trips/${trip.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40">
      <div className="hidden size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 sm:flex">
        <Plane className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{trip.flightNumber}</span>
          <span className="text-sm text-muted-foreground">
            {trip.origin.iata} → {trip.destination.iata}
          </span>
          {trip.demoMode && <Badge tone="info">Demo replay</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {formatLocal(trip.scheduledDeparture, trip.origin.tz, { withZone: false })} · {trip.airlineName}
          {delayMinutes != null && delayMinutes >= 15 ? ` · ${formatDuration(delayMinutes)} late` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
        <StatusBadge status={flightStatusKey(trip, delayMinutes)} />
        {eligibility && eligibility !== "not_eligible" && <StatusBadge status={eligibility} />}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
