import type { Metadata } from "next";
import Link from "next/link";
import { Plane, Plus } from "lucide-react";
import { env } from "@/lib/env";
import { requirePageUser } from "@/lib/session";
import { listTrips } from "@/lib/dal";
import { nowMs } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { TripRow } from "@/components/trips/trip-row";
import { DemoTripButton } from "@/components/trips/demo-trip-button";

export const metadata: Metadata = { title: "Trips" };

export default async function TripsPage() {
  const user = await requirePageUser();
  const items = await listTrips(user.oid);
  const now = nowMs();
  const upcoming = items.filter((i) => new Date(i.trip.scheduledArrival).getTime() > now - 12 * 3600_000);
  const past = items.filter((i) => !upcoming.includes(i));

  return (
    <>
      <PageHeader
        title="Trips"
        description="Every flight you add is tracked live around its departure, and the evidence is kept."
        actions={
          items.length > 0 && (
            <Button asChild>
              <Link href="/app/trips/new">
                <Plus /> New trip
              </Link>
            </Button>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Plane}
          title="No trips yet"
          description="Add a flight before you fly, so tracking starts automatically three hours before departure."
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
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Upcoming and active</h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {upcoming
                    .slice()
                    .reverse()
                    .map((i) => (
                      <TripRow key={i.trip.id} trip={i.trip} delayMinutes={i.outcome?.delayMinutes} eligibility={i.eligibility?.status} />
                    ))}
                </CardContent>
              </Card>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Past</h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {past.map((i) => (
                    <TripRow key={i.trip.id} trip={i.trip} delayMinutes={i.outcome?.delayMinutes} eligibility={i.eligibility?.status} />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  );
}
