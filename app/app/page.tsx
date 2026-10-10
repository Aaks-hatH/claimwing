import type { Metadata } from "next";
import Link from "next/link";
import { Plane, Plus } from "lucide-react";
import { env } from "@/lib/env";
import { requirePageUser, sdrOf } from "@/lib/session";
import { dashboardData } from "@/lib/dal";
import { ensureDeadlineReminders } from "@/lib/deadlines";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, NotLegalAdvice } from "@/components/ui/feedback";
import { DemoTripButton } from "@/components/trips/demo-trip-button";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  await ensureDeadlineReminders(user.oid).catch(() => 0);
  const d = await dashboardData(user.oid, sdrOf(user));
  const first = user.name.split(" ")[0];

  if (d.tripCount === 0) {
    return (
      <>
        <PageHeader eyebrow="Welcome" title={`Hello, ${first}.`} description="Add a flight before you travel. ClaimWing tracks it live and keeps the evidence for you." />
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

  return <DashboardView d={d} first={first} demoEnabled={env.demoMode()} />;
}
