import type { Metadata } from "next";
import Link from "next/link";
import { Plane, Plus } from "lucide-react";
import { env } from "@/lib/env";
import { requirePageUser } from "@/lib/session";
import { listTrips } from "@/lib/dal";
import { nowMs } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { FlightFilter, type FlightItem } from "@/components/trips/flight-filter";
import { DemoTripButton } from "@/components/trips/demo-trip-button";

export const metadata: Metadata = { title: "Trips" };

export default async function TripsPage() {
  const user = await requirePageUser();
  const items = await listTrips(user.oid);
  const now = nowMs();

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
        <FlightFilter now={now} items={items.map((i) => ({ trip: i.trip, delay: i.outcome?.delayMinutes ?? null, eligibility: (i.eligibility?.status as FlightItem["eligibility"]) ?? null }))} />
      )}
    </>
  );
}
