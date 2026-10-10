import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, Plane, Plus } from "lucide-react";
import { env } from "@/lib/env";
import { requirePageUser, sdrOf } from "@/lib/session";
import { dashboardData } from "@/lib/dal";
import { ensureDeadlineReminders } from "@/lib/deadlines";
import { formatMoneyList } from "@/lib/format";
import { formatLocal, daysUntil } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { EmptyState, PageHeader, Stat, StatusBadge, NotLegalAdvice } from "@/components/ui/feedback";
import { TripRow } from "@/components/trips/trip-row";
import { DemoTripButton } from "@/components/trips/demo-trip-button";
import { ClaimsChart } from "@/components/claim/claims-chart";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  await ensureDeadlineReminders(user.oid).catch(() => 0);
  const d = await dashboardData(user.oid, sdrOf(user));
  const first = user.name.split(" ")[0];

  if (d.tripCount === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${first}`} description="Add a flight before you travel. ClaimWing tracks it live and keeps the evidence for you." />
        <EmptyState
          icon={Plane}
          title="No trips yet"
          description="Add your next flight to start tracking it, or try a demo flight that replays a delayed journey in a few minutes."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/app/trips/new">
                  <Plus /> Add a trip
                </Link>
              </Button>
              <DemoTripButton enabled={env.demoMode()} />
            </div>
          }
        />
        <NotLegalAdvice className="mt-6 text-center" />
      </>
    );
  }

  const nearestDays = d.nearest ? daysUntil(d.nearest.dueAt) : null;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${first}`}
        description="Your flights, evidence and claims in one place."
        actions={
          <>
            <DemoTripButton variant="outline" enabled={env.demoMode()} />
            <Button asChild>
              <Link href="/app/trips/new">
                <Plus /> New trip
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Potential compensation identified"
          value={formatMoneyList(d.potential) ?? "—"}
          hint={d.eligibleTrips.length ? `${d.eligibleTrips.length} flight${d.eligibleTrips.length > 1 ? "s" : ""}, lowest likely amounts` : "No eligible flights yet"}
        />
        <Stat label="Claims in progress" value={d.inProgress} hint={d.drafts ? `${d.drafts} draft${d.drafts > 1 ? "s" : ""} not sent yet` : "Ready, sent or awaiting reply"} />
        <Stat label="Recovered" value={formatMoneyList(d.recovered) ?? "—"} hint="From claims marked paid" />
        <Stat
          label="Nearest deadline"
          value={d.nearest ? (nearestDays! < 1 ? "Today" : `${Math.floor(nearestDays!)} day${Math.floor(nearestDays!) === 1 ? "" : "s"}`) : "—"}
          hint={d.nearest ? `${d.nearest.label} · ${d.nearest.description}` : "No open baggage deadlines"}
        />
      </div>

      {d.nearest && nearestDays !== null && nearestDays <= 3 && (
        <Card className="mt-4 border-warning/40 bg-warning-soft">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="font-medium">{d.nearest.label} due {formatLocal(d.nearest.dueAt, null, { withZone: false })}</p>
                <p className="text-sm text-muted-foreground">Missing this deadline can defeat your baggage claim. Send it in writing to the airline.</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/trips/${d.nearest.tripId}/baggage/${d.nearest.bagId}`}>Open bag</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {d.upcoming.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Being tracked</CardTitle>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {d.upcoming.map((t) => (
                  <TripRow key={t.id} trip={t} />
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent trips</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/app/trips">
                  All trips <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {d.recent.map((r) => (
                <TripRow key={r.trip.id} trip={r.trip} delayMinutes={r.outcome?.delayMinutes ?? null} eligibility={r.status} />
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Claims by status</CardTitle>
            </CardHeader>
            <CardContent>
              {d.claimsByStatus.some((c) => c.count) ? (
                <ClaimsChart data={d.claimsByStatus} />
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <FileText className="mx-auto mb-2 size-5" aria-hidden />
                  Claims you start will show up here.
                </div>
              )}
            </CardContent>
          </Card>
          {d.eligibleTrips.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Worth claiming</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {d.eligibleTrips.slice(0, 4).map((e) => (
                  <Link key={e.id} href={`/app/trips/${e.id}?tab=claim`} className="block rounded-lg border p-3 hover:bg-muted/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{e.flight}</span>
                      <StatusBadge status="eligible" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{e.summary}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          <NotLegalAdvice />
        </div>
      </div>
    </>
  );
}
