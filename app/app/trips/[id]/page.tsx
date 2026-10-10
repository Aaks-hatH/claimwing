import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageUser, sdrOf } from "@/lib/session";
import { getTripBundle } from "@/lib/dal";
import { getTrackerState } from "@/lib/flight-tracker";
import { formatLocal, nowMs } from "@/lib/time";
import { isObjectId } from "@/lib/utils";
import { US_TERRITORY } from "@/lib/rules/regions";
import { Badge, PageHeader, StatusBadge } from "@/components/ui/feedback";
import { TripTabs, type TabId } from "@/components/trips/trip-tabs";
import { TripActions } from "@/components/trips/trip-actions";
import { FlightPanel } from "@/components/flight/flight-panel";
import { OutcomeEditor } from "@/components/flight/outcome-editor";
import { WeatherCard } from "@/components/flight/weather-card";
import { OverviewPanel } from "@/components/trips/overview-panel";
import { BaggageList } from "@/components/baggage/baggage-list";
import { ClaimPanel } from "@/components/claim/claim-panel";
import { flightStatusKey } from "@/components/trips/trip-row";

export const metadata: Metadata = { title: "Trip" };

const TAB_IDS: TabId[] = ["overview", "flight", "baggage", "claim"];

export default async function TripPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isObjectId(id)) notFound();
  const user = await requirePageUser();
  const bundle = await getTripBundle(user.oid, id, sdrOf(user));
  if (!bundle) notFound();
  const tracker = await getTrackerState(id, user.oid);
  if (!tracker) notFound();
  const { trip, outcome, bags, claims, eligibility } = bundle;
  const tab = (TAB_IDS.includes(sp.tab as TabId) ? sp.tab : "overview") as TabId;
  const manual = (k: string) => tracker.outcome?.evidence.find((e) => e.kind === k)?.time ?? null;
  const primaryRegime = eligibility?.results.find((r) => r.applies && r.regime !== "US_DOT")?.regime ?? (eligibility?.results.find((r) => r.applies)?.regime ?? null);

  return (
    <>
      <Link href="/app/trips" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Trips
      </Link>
      <PageHeader
        eyebrow={`${trip.airlineName} · ${formatLocal(trip.scheduledDeparture, trip.origin.tz, { withZone: false })}`}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {trip.flightNumber}
            <span className="text-muted-foreground">
              {trip.origin.iata} → {trip.destination.iata}
            </span>
            <StatusBadge status={flightStatusKey(trip, outcome?.delayMinutes)} />
            {trip.demoMode && <Badge tone="info">Demo replay</Badge>}
          </span>
        }
        description={`${trip.origin.city ?? trip.origin.name} to ${trip.destination.city ?? trip.destination.name} · ${trip.passengerName}${trip.bookingRef ? ` · ${trip.bookingRef}` : ""}`}
        actions={<TripActions tripId={trip.id} demo={trip.demoMode} />}
      />
      <TripTabs
        initial={tab}
        panels={{
          overview: <OverviewPanel trip={trip} outcome={outcome} eligibility={eligibility} bags={bags} claims={claims} units={user.preferences.units} />,
          flight: (
            <div className="space-y-6">
              <FlightPanel
                trip={trip}
                initial={tracker}
                units={user.preferences.units}
                regime={{
                  id: primaryRegime,
                  distanceKm: eligibility?.distanceKm ?? 0,
                  domesticUs: US_TERRITORY.has(trip.origin.country) && US_TERRITORY.has(trip.destination.country),
                }}
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <OutcomeEditor trip={trip} outcome={outcome} manualArrival={manual("manual_arrival")} manualDeparture={manual("manual_departure")} />
                <WeatherCard
                  tripId={trip.id}
                  weather={(outcome?.weather as never) ?? null}
                  canFetch={new Date(trip.scheduledDeparture).getTime() < nowMs() + 14 * 86_400_000}
                />
              </div>
            </div>
          ),
          baggage: <BaggageList trip={trip} bags={bags} />,
          claim: <ClaimPanel trip={trip} outcome={outcome} eligibility={eligibility} bags={bags} claims={claims} />,
        }}
      />
    </>
  );
}
