import Link from "next/link";
import { ArrowRight, Briefcase, Camera, CheckCircle2, Circle, FileText, Plane } from "lucide-react";
import type { BagView, ClaimView, OutcomeView, TripView } from "@/lib/dal";
import type { FlightEligibility } from "@/lib/rules/engine";
import { formatDuration, formatLocal, nowMs } from "@/lib/time";
import { formatDistance, formatMoney, BAG_STATUS_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { DefinitionList, NotLegalAdvice, StatusBadge } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export function OverviewPanel({
  trip,
  outcome,
  eligibility,
  bags,
  claims,
  units,
}: {
  trip: TripView;
  outcome: OutcomeView;
  eligibility: FlightEligibility | null;
  bags: BagView[];
  claims: ClaimView[];
  units: "metric" | "imperial";
}) {
  const p = eligibility?.primary;
  const departed = new Date(trip.scheduledDeparture).getTime() < nowMs();
  const steps = [
    { done: true, label: "Trip added", href: undefined },
    { done: bags.some((b) => b.beforeCount > 0), label: "Photograph your bag at check-in", href: `?tab=baggage` },
    { done: departed || trip.status !== "scheduled", label: "Flight tracked live", href: `?tab=flight` },
    { done: Boolean(outcome?.actualArrival) || trip.status === "cancelled", label: "Arrival time recorded", href: `?tab=flight` },
    { done: claims.length > 0, label: "Start a claim if you're eligible", href: `?tab=claim` },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane className="size-4 text-muted-foreground" aria-hidden /> Flight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionList
              items={[
                ["Scheduled departure", `${formatLocal(trip.scheduledDeparture, trip.origin.tz)} · ${trip.origin.iata}`],
                ["Scheduled arrival", `${formatLocal(trip.scheduledArrival, trip.destination.tz)} · ${trip.destination.iata}`],
                ["Actual arrival", outcome?.actualArrival ? `${formatLocal(outcome.actualArrival, trip.destination.tz)}` : "Not yet recorded"],
                ["Delay", outcome?.delayMinutes != null ? `${formatDuration(outcome.delayMinutes)}${outcome.delaySource ? ` (${outcome.delaySource})` : ""}` : "Not recorded yet"],
                ["Distance", eligibility ? formatDistance(eligibility.distanceKm, units) : "Unknown"],
                ["Ticket price", trip.ticketPrice ? formatMoney(trip.ticketPrice.amount, trip.ticketPrice.currency) : "Not entered"],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Compensation estimate</CardTitle>
              <CardDescription>{eligibility?.summary ?? "We couldn't evaluate this route."}</CardDescription>
            </div>
            {p && <StatusBadge status={p.status} />}
          </CardHeader>
          {p && (
            <CardContent className="space-y-3">
              {p.amount != null && p.currency && p.kind !== "none" && (
                <p className="text-3xl font-semibold tabular-nums tracking-tight">
                  {p.minAmount ? `${formatMoney(p.minAmount, p.currency)}–` : ""}
                  {formatMoney(p.amount, p.currency)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{p.kind === "refund" ? "possible refund" : `under ${p.regime}`}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground">{p.explanation[p.explanation.length - 1]}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="?tab=claim">
                  See the full reasoning <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="size-4 text-muted-foreground" aria-hidden /> Baggage
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="?tab=baggage">
                Manage <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {bags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bags yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {bags.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/app/trips/${trip.id}/baggage/${b.id}`} className="font-medium hover:underline">
                      {b.description}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Camera className="size-3.5" aria-hidden /> {b.beforeCount}/{b.afterCount}
                      <span>{BAG_STATUS_LABELS[b.status]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="To do" />}
                  {s.href && !s.done ? (
                    <Link href={s.href} className="hover:underline">
                      {s.label}
                    </Link>
                  ) : (
                    <span className={cn(s.done && "text-muted-foreground")}>{s.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        {claims.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" aria-hidden /> Claims
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {claims.map((c) => (
                <Link key={c.id} href={`/app/claims/${c.id}`} className="flex items-center justify-between rounded-lg border p-2.5 text-sm hover:bg-muted/50">
                  <span className="capitalize">{c.type} claim</span>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
        <NotLegalAdvice />
      </div>
    </div>
  );
}
