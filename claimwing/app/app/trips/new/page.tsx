import type { Metadata } from "next";
import { env } from "@/lib/env";
import { requirePageUser } from "@/lib/session";
import { PageHeader } from "@/components/ui/feedback";
import { TripForm } from "@/components/trips/trip-form";
import { DemoTripButton } from "@/components/trips/demo-trip-button";

export const metadata: Metadata = { title: "New trip" };

export default async function NewTripPage() {
  const user = await requirePageUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add a trip"
        description="Add your flight before you travel so we can track it live."
        actions={<DemoTripButton variant="outline" size="sm" enabled={env.demoMode()} />}
      />
      <TripForm mode="create" defaultPassenger={user.name} />
    </div>
  );
}
