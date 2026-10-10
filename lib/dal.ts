import "server-only";
import type { Types } from "mongoose";
import { connectDB } from "./db";
import { BaggageItem, BaggagePhoto, Claim, DamageMarker, FlightOutcome, Trip, type BaggageDoc, type ClaimDoc, type OutcomeDoc, type TripDoc } from "@/models";
import { getAirline, getAirport } from "./reference";
import { flightEligibility, baggageEligibility, type Sdr } from "./eligibility";
import type { FlightEligibility, BaggageEligibility } from "./rules/engine";

/* Data access for pages. Every function takes the user id and filters on it. */

export type AirportView = { iata: string; name: string; city: string | null; country: string; tz: string | null; lat: number; lon: number };

export function airportView(iata: string): AirportView {
  const a = getAirport(iata);
  return a
    ? { iata: a.iata, name: a.name, city: a.city, country: a.country, tz: a.tz, lat: a.lat, lon: a.lon }
    : { iata, name: iata, city: null, country: "", tz: null, lat: 0, lon: 0 };
}

export type TripView = ReturnType<typeof tripView>;
export function tripView(t: TripDoc) {
  return {
    id: String(t._id),
    airline: t.airline,
    airlineName: t.airlineName ?? getAirline(t.airline)?.name ?? t.airline,
    flightNumber: t.flightNumber,
    flightDate: t.flightDate,
    origin: airportView(t.origin),
    destination: airportView(t.destination),
    scheduledDeparture: new Date(t.scheduledDeparture).toISOString(),
    scheduledArrival: new Date(t.scheduledArrival).toISOString(),
    bookingRef: t.bookingRef ?? null,
    passengerName: t.passengerName,
    ticketPrice: t.ticketPrice?.amount != null ? { amount: t.ticketPrice.amount, currency: t.ticketPrice.currency ?? "USD" } : null,
    operatingCarrierRegion: t.operatingCarrierRegion ?? "auto",
    demoMode: Boolean(t.demoMode),
    status: t.tracking?.status ?? "scheduled",
    estimatedArrival: t.tracking?.estimatedArrival ? new Date(t.tracking.estimatedArrival).toISOString() : null,
    finalized: Boolean(t.tracking?.finalizedAt),
    icao24: t.tracking?.icao24 ?? null,
    callsign: t.tracking?.callsign ?? null,
    createdAt: new Date(t.createdAt).toISOString(),
  };
}

export type OutcomeView = ReturnType<typeof outcomeView>;
export function outcomeView(o: OutcomeDoc | null) {
  if (!o) return null;
  return {
    disruption: o.disruption,
    actualArrival: o.actualArrival ? new Date(o.actualArrival).toISOString() : null,
    actualDeparture: o.actualDeparture ? new Date(o.actualDeparture).toISOString() : null,
    delayMinutes: o.delayMinutes ?? null,
    delaySource: o.delaySource ?? null,
    delayKind: o.delayKind ?? null,
    cause: o.cause,
    causeNote: o.causeNote ?? null,
    cancellationNoticeDays: o.cancellationNoticeDays ?? null,
    reroutingOffered: o.reroutingOffered ?? null,
    deniedBoardingVoluntary: o.deniedBoardingVoluntary ?? null,
    weather: (o.causeEvidence as { weather?: unknown } | undefined)?.weather ?? null,
  };
}

export type BagView = ReturnType<typeof bagView>;
export function bagView(b: BaggageDoc, extra: { beforeCount: number; afterCount: number; markers: number; eligibility: BaggageEligibility | null }) {
  return {
    id: String(b._id),
    tripId: String(b.tripId),
    description: b.description,
    tagNumber: b.tagNumber ?? null,
    contentsCategory: b.contentsCategory,
    estimatedValue: b.estimatedValue?.amount != null ? { amount: b.estimatedValue.amount, currency: b.estimatedValue.currency ?? "USD" } : null,
    status: b.status,
    receivedAt: b.receivedAt ? new Date(b.receivedAt).toISOString() : null,
    reportedMissingAt: b.reportedMissingAt ? new Date(b.reportedMissingAt).toISOString() : null,
    deliveredAt: b.deliveredAt ? new Date(b.deliveredAt).toISOString() : null,
    pirReference: b.pirReference ?? null,
    notes: b.notes ?? null,
    receipts: (b.receipts ?? []).map((r) => ({
      id: String(r._id),
      key: r.storageKey,
      filename: r.filename ?? "receipt",
      mime: r.mime ?? null,
      size: r.size ?? null,
      uploadedAt: r.uploadedAt ? new Date(r.uploadedAt).toISOString() : null,
    })),
    ...extra,
  };
}

export type ClaimView = ReturnType<typeof claimView>;
export function claimView(c: ClaimDoc) {
  return {
    id: String(c._id),
    tripId: String(c.tripId),
    type: c.type,
    baggageIds: (c.baggageIds ?? []).map(String),
    amount: c.amount ?? null,
    currency: c.currency ?? null,
    status: c.status,
    letterText: c.letterText ?? "",
    letterSource: c.letterSource,
    recoveredAmount: c.recoveredAmount ?? null,
    airlineReference: c.airlineReference ?? null,
    eligibility: (c.eligibility ?? null) as FlightEligibility | null,
    timeline: (c.timeline ?? []).map((e) => ({ at: new Date(e.at).toISOString(), status: e.status, note: e.note ?? null })),
    lastExportAt: c.lastExportAt ? new Date(c.lastExportAt).toISOString() : null,
    createdAt: new Date(c.createdAt).toISOString(),
    updatedAt: new Date(c.updatedAt).toISOString(),
  };
}

export async function listTrips(userId: Types.ObjectId) {
  await connectDB();
  const trips = await Trip.find({ userId }).sort({ scheduledDeparture: -1 }).limit(200).lean<TripDoc[]>();
  const outcomes = await FlightOutcome.find({ userId, tripId: { $in: trips.map((t) => t._id) } }).lean<OutcomeDoc[]>();
  return trips.map((t) => {
    const o = outcomes.find((x) => String(x.tripId) === String(t._id)) ?? null;
    const elig = flightEligibility(t, o);
    return { trip: tripView(t), outcome: outcomeView(o), eligibility: elig ? { status: elig.primary?.status ?? "not_eligible", summary: elig.summary } : null };
  });
}

export async function bagsForTrip(userId: Types.ObjectId, trip: TripDoc, outcome: OutcomeDoc | null, sdr: Sdr) {
  const bags = await BaggageItem.find({ userId, tripId: trip._id }).sort({ createdAt: 1 }).lean<BaggageDoc[]>();
  const ids = bags.map((b) => b._id);
  const [photos, markers] = await Promise.all([
    BaggagePhoto.find({ userId, baggageId: { $in: ids } }).select("baggageId stage").lean(),
    DamageMarker.find({ userId, baggageId: { $in: ids }, confirmed: true, dismissed: false }).select("baggageId").lean(),
  ]);
  return bags.map((b) =>
    bagView(b, {
      beforeCount: photos.filter((p) => String(p.baggageId) === String(b._id) && p.stage === "before").length,
      afterCount: photos.filter((p) => String(p.baggageId) === String(b._id) && p.stage === "after").length,
      markers: markers.filter((m) => String(m.baggageId) === String(b._id)).length,
      eligibility: baggageEligibility(b, trip, outcome, sdr),
    }),
  );
}

export async function getTripBundle(userId: Types.ObjectId, tripId: string, sdr: Sdr) {
  await connectDB();
  const trip = await Trip.findOne({ _id: tripId, userId }).lean<TripDoc>();
  if (!trip) return null;
  const outcome = await FlightOutcome.findOne({ tripId: trip._id, userId }).lean<OutcomeDoc>();
  const [bags, claims] = await Promise.all([
    bagsForTrip(userId, trip, outcome, sdr),
    Claim.find({ userId, tripId: trip._id }).sort({ createdAt: -1 }).lean<ClaimDoc[]>(),
  ]);
  return {
    trip: tripView(trip),
    outcome: outcomeView(outcome),
    bags,
    claims: claims.map(claimView),
    eligibility: flightEligibility(trip, outcome),
    raw: { trip, outcome },
  };
}

export async function dashboardData(userId: Types.ObjectId, sdr: Sdr) {
  await connectDB();
  const trips = await Trip.find({ userId }).sort({ scheduledDeparture: -1 }).limit(200).lean<TripDoc[]>();
  const tripIds = trips.map((t) => t._id);
  const [outcomes, claims, bags] = await Promise.all([
    FlightOutcome.find({ userId, tripId: { $in: tripIds } }).lean<OutcomeDoc[]>(),
    Claim.find({ userId }).lean<ClaimDoc[]>(),
    BaggageItem.find({ userId, status: { $in: ["arrived_damaged", "delayed", "lost"] } }).lean<BaggageDoc[]>(),
  ]);

  const potential = new Map<string, number>();
  const eligibleTrips: Array<{ id: string; flight: string; summary: string }> = [];
  for (const t of trips) {
    const o = outcomes.find((x) => String(x.tripId) === String(t._id)) ?? null;
    const e = flightEligibility(t, o);
    const p = e?.primary;
    if (p && p.status !== "not_eligible" && p.amount && p.currency && p.kind === "compensation") {
      potential.set(p.currency, (potential.get(p.currency) ?? 0) + (p.minAmount ?? p.amount));
      eligibleTrips.push({ id: String(t._id), flight: t.flightNumber, summary: e!.summary });
    }
  }

  const recovered = new Map<string, number>();
  for (const c of claims) {
    if (c.status === "paid" && c.recoveredAmount && c.currency) recovered.set(c.currency, (recovered.get(c.currency) ?? 0) + c.recoveredAmount);
  }
  const inProgress = claims.filter((c) => ["ready", "sent", "awaiting_reply"].includes(c.status)).length;
  const drafts = claims.filter((c) => c.status === "draft").length;

  let nearest: { label: string; dueAt: string; bagId: string; tripId: string; description: string } | null = null;
  for (const b of bags) {
    const t = trips.find((x) => String(x._id) === String(b.tripId));
    if (!t) continue;
    const o = outcomes.find((x) => String(x.tripId) === String(b.tripId)) ?? null;
    const r = baggageEligibility(b, t, o, sdr);
    for (const d of r?.deadlines ?? []) {
      if (d.kind === "limitation" || new Date(d.dueAt).getTime() < Date.now()) continue;
      if (!nearest || d.dueAt < nearest.dueAt) nearest = { label: d.label, dueAt: d.dueAt, bagId: String(b._id), tripId: String(t._id), description: b.description };
    }
  }

  const now = Date.now();
  const upcoming = trips
    .filter((t) => new Date(t.scheduledArrival).getTime() > now - 12 * 3600_000 && !t.tracking?.finalizedAt)
    .sort((a, b) => +new Date(a.scheduledDeparture) - +new Date(b.scheduledDeparture))
    .slice(0, 5)
    .map(tripView);
  const recent = trips.slice(0, 6).map((t) => {
    const o = outcomes.find((x) => String(x.tripId) === String(t._id)) ?? null;
    const e = flightEligibility(t, o);
    return { trip: tripView(t), outcome: outcomeView(o), status: e?.primary?.status ?? null };
  });

  return {
    potential: [...potential.entries()].map(([currency, amount]) => ({ currency, amount })),
    recovered: [...recovered.entries()].map(([currency, amount]) => ({ currency, amount })),
    inProgress,
    drafts,
    nearest,
    upcoming,
    recent,
    eligibleTrips,
    tripCount: trips.length,
    claimsByStatus: ["draft", "ready", "sent", "awaiting_reply", "paid", "rejected"].map((s) => ({ status: s, count: claims.filter((c) => c.status === s).length })),
  };
}
