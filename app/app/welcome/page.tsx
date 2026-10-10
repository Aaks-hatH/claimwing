import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { listTrips } from "@/lib/dal";
import { isObjectId } from "@/lib/utils";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const [user, sp] = await Promise.all([requirePageUser(), searchParams]);
  const trips = (await listTrips(user.oid)).map((t) => t.trip).filter((t) => !t.demoMode);
  const initial = sp.trip && isObjectId(sp.trip) && trips.some((t) => t.id === sp.trip) ? sp.trip : null;
  return (
    <WelcomeWizard
      name={user.name.split(" ")[0]}
      existing={trips.map((t) => ({ id: t.id, flightNumber: t.flightNumber, flightDate: t.flightDate, origin: { iata: t.origin.iata }, destination: { iata: t.destination.iata } }))}
      initialTripId={initial}
      sharing={user.preferences.communityReports}
    />
  );
}
