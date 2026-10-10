import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePageUser, sdrOf } from "@/lib/session";
import { getTripBundle } from "@/lib/dal";
import { utcToLocalParts } from "@/lib/time";
import { isObjectId } from "@/lib/utils";
import { PageHeader } from "@/components/ui/feedback";
import { TripForm } from "@/components/trips/trip-form";

export const metadata: Metadata = { title: "Edit trip" };

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isObjectId(id)) notFound();
  const user = await requirePageUser();
  const bundle = await getTripBundle(user.oid, id, sdrOf(user));
  if (!bundle) notFound();
  const t = bundle.trip;
  if (t.demoMode) redirect(`/app/trips/${id}`);
  const dep = utcToLocalParts(t.scheduledDeparture, t.origin.tz);
  const arr = utcToLocalParts(t.scheduledArrival, t.destination.tz);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${t.flightNumber}`} description="Changing the flight number, date, airports or times restarts tracking. Times you entered yourself are kept." />
      <TripForm
        mode="edit"
        tripId={id}
        defaultPassenger={t.passengerName}
        labels={{ airline: `${t.airline} · ${t.airlineName}`, origin: `${t.origin.iata} · ${t.origin.name}`, destination: `${t.destination.iata} · ${t.destination.name}` }}
        initial={{
          airline: t.airline,
          flightNumber: t.flightNumber.slice(2),
          flightDate: dep.date,
          origin: t.origin.iata,
          destination: t.destination.iata,
          departureTime: dep.time,
          arrivalDate: arr.date,
          arrivalTime: arr.time,
          passengerName: t.passengerName,
          bookingRef: t.bookingRef ?? "",
          priceAmount: t.ticketPrice ? String(t.ticketPrice.amount) : "",
          priceCurrency: t.ticketPrice?.currency ?? "USD",
          operatingCarrierRegion: t.operatingCarrierRegion as "auto" | "eu" | "uk" | "other",
          icao24: t.icao24 ?? "",
        }}
      />
    </div>
  );
}
