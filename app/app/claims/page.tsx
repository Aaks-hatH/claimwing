import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { claimView } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import { relativeTime } from "@/lib/time";
import { Claim, Trip } from "@/models";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { Badge, EmptyState, NotLegalAdvice, PageHeader, StatusBadge } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Claims" };

export default async function ClaimsPage() {
  const user = await requirePageUser();
  await connectDB();
  const claims = (await Claim.find({ userId: user.oid }).sort({ updatedAt: -1 }).lean()).map(claimView);
  const trips = await Trip.find({ userId: user.oid, _id: { $in: claims.map((c) => c.tripId) } }).select("flightNumber origin destination flightDate demoMode").lean();
  const tripOf = (id: string) => trips.find((t) => String(t._id) === id);

  return (
    <>
      <PageHeader title="Claims" description="Track each claim from draft to payment. Vola never contacts the airline for you." />
      {claims.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No claims yet"
          description="Open a trip and use the Claim tab when a flight is delayed or a bag arrives damaged."
          action={
            <Button asChild variant="outline">
              <Link href="/app/trips">Go to trips</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {claims.map((c) => {
              const t = tripOf(c.tripId);
              return (
                <Link key={c.id} href={`/app/claims/${c.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {t ? `${t.flightNumber} ${t.origin} → ${t.destination}` : "Trip deleted"}
                      <span className="text-sm font-normal capitalize text-muted-foreground">{c.type} claim</span>
                      {t?.demoMode && <Badge tone="info">Demo</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.amount && c.currency ? formatMoney(c.amount, c.currency) : "No amount"} · updated {relativeTime(c.updatedAt)}
                      {c.recoveredAmount ? ` · recovered ${formatMoney(c.recoveredAmount, c.currency)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
      <NotLegalAdvice className="mt-6" />
    </>
  );
}
