import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { exportManifest, loadClaimContext } from "@/lib/claims";
import { claimView } from "@/lib/dal";
import { env } from "@/lib/env";
import { isObjectId } from "@/lib/utils";
import { Badge, PageHeader, StatusBadge } from "@/components/ui/feedback";
import { ClaimEditor } from "@/components/claim/claim-editor";
import { ClaimReadiness } from "@/components/claim/claim-readiness";
import { claimReadiness } from "@/lib/claim-readiness";
import { FlightReport } from "@/models";
import { tripFlightKey } from "@/lib/ripple/flight-id";

export const metadata: Metadata = { title: "Claim" };

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isObjectId(id)) notFound();
  const user = await requirePageUser();
  const ctx = await loadClaimContext(user, id);
  if (!ctx) notFound();
  const claim = claimView(ctx.claim);
  const t = ctx.trip;
  const observations = await FlightReport.countDocuments({ userId: user.oid, flightKey: tripFlightKey(t) }).catch(() => 0);
  const readiness = claimReadiness(ctx, { now: new Date(), observations });
  return (
    <>
      <Link href={`/app/trips/${t._id}?tab=claim`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t.flightNumber}
      </Link>
      <PageHeader
        eyebrow={`${ctx.airlineName} · ${t.flightDate}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="capitalize">{claim.type} claim</span>
            <span className="text-muted-foreground">
              {t.flightNumber} {t.origin} → {t.destination}
            </span>
            <StatusBadge status={claim.status} />
            {t.demoMode && <Badge tone="info">Demo replay</Badge>}
          </span>
        }
        description={ctx.eligibility?.summary ?? `${ctx.bags.length} bag${ctx.bags.length === 1 ? "" : "s"} included`}
      />
      <div className="mb-6">
        <ClaimReadiness r={readiness} />
      </div>
      <ClaimEditor
        claim={claim}
        manifest={exportManifest(ctx)}
        aiEnabled={Boolean(env.anthropicKey())}
        demo={t.demoMode}
        placeholdersHint={(claim.letterText.match(/\[[A-Z][A-Z0-9 ,.'/-]*\]/g) ?? []).length}
      />
    </>
  );
}
