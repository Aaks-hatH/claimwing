import "server-only";
import type { Types } from "mongoose";
import { connectDB } from "./db";
import { BaggageItem, BaggagePhoto, Claim, DamageMarker, FlightOutcome, FlightSnapshot, Trip, type BaggageDoc, type ClaimDoc, type MarkerDoc, type OutcomeDoc, type PhotoDoc, type TripDoc, type TimeEvidence } from "@/models";
import { flightEligibility, baggageEligibility } from "./eligibility";
import { getAirline, getAirport } from "./reference";
import { sdrOf, type CurrentUser } from "./session";
import type { WeatherContext } from "./weather";
import { evidenceLabel } from "./flight-tracker";

/** Everything known about a claim, gathered once for the letter, the PDF and the ZIP export. */
export type ClaimContext = Awaited<ReturnType<typeof loadClaimContext>>;

export async function loadClaimContext(user: CurrentUser, claimId: string | Types.ObjectId) {
  await connectDB();
  const claim = await Claim.findOne({ _id: claimId, userId: user.oid }).lean<ClaimDoc>();
  if (!claim) return null;
  const trip = await Trip.findOne({ _id: claim.tripId, userId: user.oid }).lean<TripDoc>();
  if (!trip) return null;
  const outcome = await FlightOutcome.findOne({ tripId: trip._id, userId: user.oid }).lean<OutcomeDoc>();
  const includeFlight = claim.type !== "baggage";
  const includeBags = claim.type !== "flight";
  const bagIds = includeBags ? claim.baggageIds ?? [] : [];
  const [bags, photos, markers, snapStats] = await Promise.all([
    BaggageItem.find({ _id: { $in: bagIds }, userId: user.oid }).lean<BaggageDoc[]>(),
    BaggagePhoto.find({ baggageId: { $in: bagIds }, userId: user.oid }).lean<PhotoDoc[]>(),
    DamageMarker.find({ baggageId: { $in: bagIds }, userId: user.oid, confirmed: true, dismissed: false }).lean<MarkerDoc[]>(),
    FlightSnapshot.aggregate<{ count: number; first: Date; last: Date; sources: string[] }>([
      { $match: { tripId: trip._id, userId: user.oid } },
      { $group: { _id: null, count: { $sum: 1 }, first: { $min: "$observedAt" }, last: { $max: "$observedAt" }, sources: { $addToSet: "$source" } } },
    ]),
  ]);
  const track = includeFlight
    ? await FlightSnapshot.find({ tripId: trip._id, userId: user.oid }).sort({ observedAt: 1 }).select("observedAt lat lon altitude onGround").lean()
    : [];

  const origin = getAirport(trip.origin);
  const destination = getAirport(trip.destination);
  const eligibility = flightEligibility(trip, outcome);
  const weather = (outcome?.causeEvidence as { weather?: { departure: WeatherContext | null; arrival: WeatherContext | null; fetchedAt: string } } | undefined)?.weather ?? null;

  return {
    user: { name: user.name, email: user.email },
    claim,
    trip,
    airlineName: trip.airlineName ?? getAirline(trip.airline)?.name ?? trip.airline,
    origin,
    destination,
    outcome,
    evidence: ((outcome?.evidence ?? []) as TimeEvidence[])
      .map((e) => ({ ...e, label: evidenceLabel(e.kind) }))
      .sort((a, b) => +new Date(a.time) - +new Date(b.time)),
    eligibility: includeFlight ? eligibility : null,
    weather: includeFlight ? weather : null,
    track: track.map((s) => ({ t: new Date(s.observedAt), lat: s.lat as number, lon: s.lon as number, alt: s.altitude ?? null, gnd: Boolean(s.onGround) })),
    trackStats: snapStats[0] ? { count: snapStats[0].count, first: snapStats[0].first, last: snapStats[0].last, sources: snapStats[0].sources } : null,
    bags: bags.map((b) => ({
      bag: b,
      eligibility: baggageEligibility(b, trip, outcome, sdrOf(user)),
      photos: photos.filter((p) => String(p.baggageId) === String(b._id)),
      markers: markers.filter((m) => String(m.baggageId) === String(b._id)),
    })),
    includeFlight,
    includeBags,
  };
}

/** Plain-language list of what an export will contain (shown in the confirmation dialog). */
export function exportManifest(ctx: NonNullable<ClaimContext>) {
  const items: string[] = [];
  items.push(`Passenger name (${ctx.trip.passengerName})${ctx.trip.bookingRef ? `, booking reference ${ctx.trip.bookingRef}` : ""}, and your email`);
  items.push(`Flight ${ctx.trip.flightNumber}, ${ctx.trip.origin} to ${ctx.trip.destination}, scheduled times`);
  if (ctx.includeFlight) {
    items.push(`${ctx.evidence.length} recorded time${ctx.evidence.length === 1 ? "" : "s"} with sources, and the delay calculation`);
    if (ctx.trackStats) items.push(`A map of ${ctx.trackStats.count} aircraft position reports`);
    if (ctx.weather) items.push("Weather context at both airports");
    items.push("The eligibility estimate and the regulation it cites");
  }
  for (const b of ctx.bags) {
    const blurred = b.photos.filter((p) => p.blurred).length;
    items.push(
      `Bag "${b.bag.description}": ${b.photos.length} photo${b.photos.length === 1 ? "" : "s"}${blurred ? ` (${blurred} blurred)` : ""}, ${b.markers.length} confirmed damage marker${b.markers.length === 1 ? "" : "s"}, ${b.bag.receipts?.length ?? 0} receipt${(b.bag.receipts?.length ?? 0) === 1 ? "" : "s"}`,
    );
    const located = b.photos.filter((p) => p.gps?.lat != null).length;
    if (located) items.push(`Location (GPS) of ${located} photo${located === 1 ? "" : "s"}`);
  }
  items.push("Your claim letter");
  return items;
}
