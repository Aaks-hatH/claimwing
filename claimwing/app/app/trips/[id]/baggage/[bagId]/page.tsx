import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { getBagBundle } from "@/lib/baggage";
import { env } from "@/lib/env";
import { isObjectId } from "@/lib/utils";
import { CONTENTS_LABELS } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui/feedback";
import { BagWorkspace } from "@/components/baggage/bag-workspace";

export const metadata: Metadata = { title: "Bag" };

export default async function BagPage({ params }: { params: Promise<{ id: string; bagId: string }> }) {
  const { id, bagId } = await params;
  if (!isObjectId(id) || !isObjectId(bagId)) notFound();
  const user = await requirePageUser();
  const bundle = await getBagBundle(user, bagId);
  if (!bundle || bundle.trip.id !== id) notFound();
  const { trip, bag, photos, markers } = bundle;
  return (
    <>
      <Link href={`/app/trips/${trip.id}?tab=baggage`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {trip.flightNumber} baggage
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {bag.description}
            {trip.demoMode && <Badge tone="info">Demo trip</Badge>}
          </span>
        }
        description={`${CONTENTS_LABELS[bag.contentsCategory]}${bag.tagNumber ? ` · Tag ${bag.tagNumber}` : ""} · ${trip.flightNumber} ${trip.origin.iata} → ${trip.destination.iata}`}
      />
      <BagWorkspace trip={trip} bag={bag} photos={photos} markers={markers} aiEnabled={Boolean(env.anthropicKey())} />
    </>
  );
}
