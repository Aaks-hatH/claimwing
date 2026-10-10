import "server-only";
import { createHash, createHmac } from "node:crypto";
import { DateTime } from "luxon";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";
import { getAirline, getAirport } from "@/lib/reference";
import { greatCircleKm } from "@/lib/rules/geo";
import { cached, invalidate } from "@/lib/providers/cache";
import { chooseArrival, chooseDeparture, evidenceLabel } from "@/lib/flight-tracker";
import { weatherAround, weatherNow } from "@/lib/weather";
import { FlightOutcome, FlightReport, RipplePrediction, Trip, User, type TimeEvidence, type TripDoc } from "@/models";
import { tripFlightKey } from "./flight-id";
import { aggregateReports, detectBurst, REPORT_INFO, validateReport, type ReportInput, type ReportType } from "./reports";
import { resolveRotation, unknownRotation, type RotationResult } from "./rotation";
import { aircraftLegs, aircraftLookupCapability } from "./aircraft-provider";
import { predictFlight, loadModel } from "./model";
import { computeRipple, diffResults, type EngineFlight, type ProviderState, type RippleChange, type RippleResult } from "./engine";

const RESULT_TTL_SECONDS = 60;
const PREDICTION_RETENTION_DAYS = 30;

/** Pseudonymous id for a contributor on one flight. Different on every flight, not reversible. */
export function contributorId(userId: string, flightKey: string) {
  const secret = process.env.AUTH_SECRET || "claimwing-dev-secret";
  return createHmac("sha256", secret).update(`${userId}:${flightKey}`).digest("hex").slice(0, 16);
}

async function ownedTrip(userId: Types.ObjectId | string, tripId: string) {
  await connectDB();
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new HttpError(404, "Trip not found.");
  return trip;
}

/* ------------------------------ passenger reports ------------------------------ */

export async function loadReportInputs(flightKey: string): Promise<ReportInput[]> {
  await connectDB();
  const since = new Date(Date.now() - 36 * 3600_000);
  const docs = await FlightReport.find({ flightKey, withdrawn: { $ne: true }, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(500)
    .select("type contributor createdAt observedAt moderation eligibility value")
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    type: d.type as ReportType,
    source: "passenger" as const,
    contributor: d.contributor,
    createdAt: new Date(d.createdAt),
    observedAt: d.observedAt ? new Date(d.observedAt) : null,
    moderation: d.moderation,
    eligibility: d.eligibility ?? 1,
    value: (d.value as string | number | null | undefined) ?? null,
  }));
}

/** Official and aircraft observations, phrased as claims so passenger reports can be checked against them. */
function officialClaims(trip: TripDoc, evidence: TimeEvidence[]): ReportInput[] {
  const out: ReportInput[] = [];
  const dep = chooseDeparture(evidence);
  const arr = chooseArrival(evidence);
  if (dep) {
    out.push({ id: "official-dep", type: "departed", source: dep.kind.startsWith("adsb") ? "aircraft" : "provider", contributor: `official:${dep.source}`, createdAt: new Date(dep.time), observedAt: new Date(dep.time), moderation: "accepted" });
  }
  if (arr) {
    out.push({ id: "official-arr", type: "landed", source: arr.kind.startsWith("adsb") ? "aircraft" : "provider", contributor: `official:${arr.source}`, createdAt: new Date(arr.time), observedAt: new Date(arr.time), moderation: "accepted" });
  }
  if (trip.tracking?.status === "cancelled") {
    const at = trip.tracking.lastScheduleFetchAt ?? trip.updatedAt;
    out.push({ id: "official-cnx", type: "cancellation_announced", source: "provider", contributor: "official:schedule", createdAt: new Date(at), moderation: "accepted" });
  }
  return out;
}

export type ReportBody = { type: ReportType; observedAt?: string | null; value?: string | number | null; note?: string | null };

export async function submitReport(user: { id: string; oid: Types.ObjectId; createdAt: string; preferences: { communityReports: boolean } }, tripId: string, body: ReportBody) {
  if (!user.preferences.communityReports) {
    throw new HttpError(403, "Sharing observations is turned off in your settings. Turn it on to report what you see.");
  }
  const trip = await ownedTrip(user.oid, tripId);
  if (trip.demoMode) throw new HttpError(400, "Demo trips are simulations. Use the Demo Center to try passenger reports.");
  const flightKey = tripFlightKey(trip);
  const now = new Date();
  const v = validateReport(body, { now, scheduledDeparture: new Date(trip.scheduledDeparture), scheduledArrival: new Date(trip.scheduledArrival) });
  if (!v.ok) throw new HttpError(422, v.message);
  const contributor = contributorId(user.id, flightKey);

  // Per-person-per-flight and per-flight limits (the route also limits each user overall).
  const [perFlightUser, perFlight] = await Promise.all([
    rateLimit("ripple-report-flight-user", `${user.id}:${flightKey}`, 6, 600),
    rateLimit("ripple-report-flight", flightKey, 300, 600),
  ]);
  if (!perFlightUser.ok) throw new HttpError(429, "You've sent several reports about this flight in the last few minutes. Please wait before sending more.");
  if (!perFlight.ok) throw new HttpError(429, "This flight is receiving a lot of reports right now. Please try again in a few minutes.");

  // Duplicate protection: the same person reporting the same thing within 10 minutes.
  const dup = await FlightReport.findOne({ flightKey, contributor, type: body.type, createdAt: { $gte: new Date(now.getTime() - 10 * 60_000) } }).lean();
  if (dup) throw new HttpError(409, "You already reported this in the last 10 minutes.");

  const flags: string[] = [];
  // Phase checks against the schedule and what is already known.
  const outcome = await FlightOutcome.findOne({ tripId: trip._id }).lean();
  const evidence = ((outcome?.evidence ?? []) as TimeEvidence[]).map((e) => ({ ...e, time: new Date(e.time) }));
  const departed = chooseDeparture(evidence);
  const phase = REPORT_INFO[body.type].phase;
  if (phase === "after_arrival" && now.getTime() < new Date(trip.scheduledDeparture).getTime()) flags.push("before_departure");
  if (phase === "before_departure" && departed && now.getTime() > new Date(departed.time).getTime() + 15 * 60_000) flags.push("after_recorded_departure");

  // Bursts: lots of reports on this flight in two minutes.
  const recent = await FlightReport.find({ flightKey, createdAt: { $gte: new Date(now.getTime() - 2 * 60_000) } }).select("createdAt").lean();
  const burstInputs: ReportInput[] = [...recent.map((r) => new Date(r.createdAt)), now].map((createdAt) => ({ id: "", type: body.type, source: "passenger", contributor: "", createdAt, moderation: "accepted" }));
  if (detectBurst(burstInputs)) {
    flags.push("burst");
  }

  // Eligibility: people who added the flight before it left, with an account older than a day.
  let eligibility = 1;
  if (new Date(trip.createdAt).getTime() > new Date(trip.scheduledDeparture).getTime() - 30 * 60_000) eligibility *= 0.7;
  if (Date.now() - new Date(user.createdAt).getTime() < 24 * 3600_000) eligibility *= 0.8;

  const doc = await FlightReport.create({
    flightKey,
    userId: user.oid,
    contributor,
    type: body.type,
    source: "passenger",
    observedAt: v.observedAt,
    value: v.value,
    note: v.note,
    moderation: flags.length ? "flagged" : "accepted",
    flags,
    eligibility: Math.round(eligibility * 100) / 100,
  });
  await invalidate(resultKey(flightKey));
  return { id: String(doc._id), moderation: doc.moderation, flags };
}

export async function myReports(userId: Types.ObjectId, flightKey: string) {
  await connectDB();
  const docs = await FlightReport.find({ userId, flightKey }).sort({ createdAt: -1 }).limit(50).lean();
  return docs.map((d) => ({
    id: String(d._id),
    type: d.type,
    label: REPORT_INFO[d.type as ReportType].label,
    createdAt: new Date(d.createdAt).toISOString(),
    observedAt: d.observedAt ? new Date(d.observedAt).toISOString() : null,
    value: (d.value as string | number | null) ?? null,
    note: d.note ?? null,
    moderation: d.moderation,
    withdrawn: Boolean(d.withdrawn),
  }));
}

export async function deleteMyReport(userId: Types.ObjectId, reportId: string) {
  await connectDB();
  const doc = await FlightReport.findOneAndDelete({ _id: reportId, userId });
  if (!doc) throw new HttpError(404, "Report not found.");
  await invalidate(resultKey(doc.flightKey));
}

export async function deleteAllMyReports(userId: Types.ObjectId) {
  await connectDB();
  const keys = await FlightReport.distinct("flightKey", { userId });
  const r = await FlightReport.deleteMany({ userId });
  await Promise.all(keys.map((k) => invalidate(resultKey(k as string))));
  return r.deletedCount ?? 0;
}

/** Turning sharing off withdraws your reports from every aggregate; turning it back on restores them. */
export async function setCommunitySharing(userId: Types.ObjectId, on: boolean) {
  await connectDB();
  await User.updateOne({ _id: userId }, { $set: { "preferences.communityReports": on } });
  const keys = await FlightReport.distinct("flightKey", { userId });
  await FlightReport.updateMany({ userId }, { $set: { withdrawn: !on } });
  await Promise.all(keys.map((k) => invalidate(resultKey(k as string))));
}

/* ------------------------------ the prediction ------------------------------ */

const resultKey = (flightKey: string) => `ripple:v1:${flightKey}`;

function engineFlight(trip: TripDoc, evidence: TimeEvidence[], key: string): EngineFlight {
  const o = getAirport(trip.origin);
  const d = getAirport(trip.destination);
  const dep = chooseDeparture(evidence);
  const arr = chooseArrival(evidence);
  return {
    key,
    flightNumber: trip.flightNumber,
    carrier: trip.airline,
    origin: { iata: trip.origin, name: o?.name ?? trip.origin, city: o?.city ?? null, tz: o?.tz ?? "UTC" },
    destination: { iata: trip.destination, name: d?.name ?? trip.destination, city: d?.city ?? null, tz: d?.tz ?? "UTC" },
    scheduledDeparture: new Date(trip.scheduledDeparture),
    scheduledArrival: new Date(trip.scheduledArrival),
    status: (trip.tracking?.status ?? "scheduled") as EngineFlight["status"],
    estimatedArrival: trip.tracking?.estimatedArrival ? new Date(trip.tracking.estimatedArrival) : null,
    estimatedArrivalSource: trip.tracking?.estimatedArrivalSource ?? null,
    actualDeparture: dep ? new Date(dep.time) : null,
    actualDepartureSource: dep ? `${dep.source}, ${evidenceLabel(dep.kind)}` : null,
    actualArrival: arr ? new Date(arr.time) : null,
    actualArrivalSource: arr ? `${arr.source}, ${evidenceLabel(arr.kind)}` : null,
    providerUpdatedAt: trip.tracking?.lastScheduleFetchAt ? new Date(trip.tracking.lastScheduleFetchAt) : null,
  };
}

async function rotationFor(trip: TripDoc, now: Date): Promise<{ rotation: RotationResult; state: ProviderState["aircraftLookup"]; error: string | null }> {
  const reg = trip.aircraft?.registration ?? null;
  const history = trip.aircraft?.history ?? [];
  const previous = history.length > 1 ? history[history.length - 2].registration : null;
  const target = {
    flightNumber: trip.flightNumber,
    origin: trip.origin,
    destination: trip.destination,
    scheduledDeparture: new Date(trip.scheduledDeparture),
    scheduledArrival: new Date(trip.scheduledArrival),
  };
  const cap = aircraftLookupCapability();
  if (!reg) {
    return {
      rotation: unknownRotation(
        cap === "available"
          ? "The schedule provider hasn't assigned an aircraft to this flight yet. Assignments usually appear on the day of travel."
          : "No data source available here assigns aircraft to flights, so the incoming flight is unknown.",
        { swap: null },
      ),
      state: cap,
      error: null,
    };
  }
  const tz = getAirport(trip.origin)?.tz ?? "UTC";
  const localHour = DateTime.fromJSDate(new Date(trip.scheduledDeparture)).setZone(tz).hour;
  const lookup = await aircraftLegs(reg, trip.flightDate, localHour);
  if (lookup.status !== "ok") {
    return { rotation: unknownRotation(lookup.reason, { registration: reg, aircraftModel: trip.aircraft?.model ?? null }), state: lookup.status === "error" ? "error" : lookup.status, error: lookup.status === "error" ? lookup.reason : null };
  }
  return { rotation: resolveRotation(target, reg, lookup.legs, { now, previousRegistration: previous }), state: "available", error: null };
}

async function weatherContext(trip: TripDoc, now: Date) {
  const o = getAirport(trip.origin);
  if (!o) return { context: null, features: null };
  const dep = new Date(trip.scheduledDeparture);
  const hoursOut = (dep.getTime() - now.getTime()) / 3600_000;
  if (hoursOut < 6 && hoursOut > -12) {
    const w = await weatherNow(o.iata, o.lat, o.lon).catch(() => null);
    if (!w) return { context: null, features: null };
    return {
      context: { severe: w.severe, summary: `${w.description} at ${o.iata}, wind about ${Math.round(w.windKmh ?? 0)} km/h${w.visibilityKm !== null ? `, visibility ${w.visibilityKm} km` : ""}.`, fetchedAt: w.fetchedAt, source: w.source },
      features: w,
    };
  }
  if (hoursOut <= 7 * 24 && hoursOut >= 6) {
    const w = await weatherAround({ airport: o.iata, role: "departure", lat: o.lat, lon: o.lon, at: dep }).catch(() => null);
    return { context: w ? { severe: w.severe, summary: w.summary, fetchedAt: w.fetchedAt, source: w.source } : null, features: null };
  }
  return { context: null, features: null };
}

export async function computeForTrip(trip: TripDoc, now = new Date()): Promise<RippleResult> {
  const key = tripFlightKey(trip);
  const outcome = await FlightOutcome.findOne({ tripId: trip._id }).lean();
  const evidence = ((outcome?.evidence ?? []) as TimeEvidence[]).map((e) => ({ ...e, time: new Date(e.time) }));
  const flight = engineFlight(trip, evidence, key);

  const [reportInputs, rot, wx] = await Promise.all([loadReportInputs(key), rotationFor(trip, now), weatherContext(trip, now)]);
  const reports = aggregateReports([...reportInputs, ...officialClaims(trip, evidence)], now);

  // Model A: pre-departure until the aircraft leaves, then the en-route model.
  const o = getAirport(trip.origin);
  const d = getAirport(trip.destination);
  let model = null;
  if (o && d && !flight.actualArrival && flight.status !== "cancelled") {
    const stage = flight.actualDeparture ? "enroute" : "predeparture";
    model = await predictFlight(stage, {
      carrier: trip.airline,
      flightNumber: trip.flightNumber,
      origin: o.iata,
      destination: d.iata,
      originTz: o.tz ?? "UTC",
      destinationTz: d.tz ?? "UTC",
      scheduledDeparture: flight.scheduledDeparture,
      scheduledArrival: flight.scheduledArrival,
      distanceKm: greatCircleKm(o, d),
      departureDelayMin: flight.actualDeparture ? Math.round((flight.actualDeparture.getTime() - flight.scheduledDeparture.getTime()) / 60_000) : null,
      weather: wx.features ? { windKmh: wx.features.windKmh, visibilityKm: wx.features.visibilityKm, precipMm: wx.features.precipMm, tempC: wx.features.tempC } : null,
    });
  }
  const loaded = await loadModel();
  const measured = (loaded.artifact?.model_b as { min_turn?: Record<string, number> } | null)?.min_turn ?? null;

  return computeRipple({
    flight,
    rotation: rot.rotation,
    reports,
    weather: wx.context,
    model,
    measuredTurnaround: measured,
    provider: {
      scheduleConfigured: env.scheduleProvider() !== "none",
      aircraftLookup: rot.state,
      errors: [trip.tracking?.lastError, rot.error].filter((x): x is string => Boolean(x)),
    },
    now,
    mode: "live",
  });
}

function inputsHash(r: RippleResult) {
  const essence = {
    t: r.thresholds.map((x) => x.risk),
    p: r.probabilities?.map((x) => Math.round(x.probability * 20)),
    e: r.expectedArrivalDelay.range ? Math.round(r.expectedArrivalDelay.range.mid / 5) : null,
    f: r.factors.map((f) => `${f.id}:${f.effect}`),
    rot: [r.rotation.registration, r.rotation.confidence],
    c: r.reports.claims.map((c) => `${c.type}:${c.level}`),
  };
  return createHash("sha256").update(JSON.stringify(essence)).digest("hex").slice(0, 16);
}

export type RippleResponse = {
  result: RippleResult;
  airports: Record<string, { tz: string; city: string | null; name: string }>;
  /** Your own trips on legs of this aircraft's rotation, so the graph can link to them. */
  ownTrips: Record<string, string>;
  changes: RippleChange[];
  previousAt: string | null;
  myReports: Awaited<ReturnType<typeof myReports>>;
  sharing: boolean;
  demo: boolean;
};

/**
 * The Flight Ripple view for one of the user's trips. The prediction is shared by everyone following
 * the same dated flight (it contains no personal data), cached for a minute, and a versioned record
 * is stored whenever it materially changes so "What changed?" can explain the difference.
 */
export async function rippleForTrip(user: { id: string; oid: Types.ObjectId; preferences: { communityReports: boolean } }, tripId: string): Promise<RippleResponse> {
  const trip = await ownedTrip(user.oid, tripId);
  const key = tripFlightKey(trip);
  const result = trip.demoMode
    ? await computeForTrip(trip)
    : await cached(resultKey(key), RESULT_TTL_SECONDS, () => computeForTrip(trip));

  let changes: RippleChange[] = [];
  let previousAt: string | null = null;
  if (!trip.demoMode) {
    const latest = await RipplePrediction.findOne({ flightKey: key }).sort({ computedAt: -1 }).lean();
    const hash = inputsHash(result);
    if (!latest || latest.inputsHash !== hash) {
      await RipplePrediction.create({
        flightKey: key,
        computedAt: new Date(result.computedAt),
        kind: result.kind === "replay" ? "unknown" : result.kind,
        modelVersion: result.model.version,
        inputsHash: hash,
        result,
        expiresAt: new Date(Date.now() + PREDICTION_RETENTION_DAYS * 86_400_000),
      }).catch(() => undefined);
      if (latest) {
        changes = diffResults(latest.result as RippleResult, result);
        previousAt = new Date(latest.computedAt).toISOString();
      }
    } else {
      const before = await RipplePrediction.findOne({ flightKey: key, _id: { $ne: latest._id } }).sort({ computedAt: -1 }).lean();
      if (before) {
        changes = diffResults(before.result as RippleResult, latest.result as RippleResult);
        previousAt = new Date(before.computedAt).toISOString();
      }
    }
  }
  const legs = result.rotation.legs;
  const own = legs.length
    ? await Trip.find({ userId: user.oid, $or: legs.map((l) => ({ flightNumber: l.flightNumber, flightDate: l.date, origin: l.origin })) }).select("_id flightNumber flightDate origin").lean()
    : [];
  const ownTrips: Record<string, string> = {};
  for (const t of own) ownTrips[`${t.flightNumber}|${t.flightDate}|${t.origin}`] = String(t._id);
  return {
    result,
    airports: airportsFor(result),
    ownTrips,
    changes,
    previousAt,
    myReports: await myReports(user.oid, key),
    sharing: user.preferences.communityReports,
    demo: Boolean(trip.demoMode),
  };
}

/** Stored prediction history for a flight the user follows (for the timeline scrubber). */
export async function predictionHistory(userId: Types.ObjectId, tripId: string) {
  const trip = await ownedTrip(userId, tripId);
  const key = tripFlightKey(trip);
  const docs = await RipplePrediction.find({ flightKey: key }).sort({ computedAt: 1 }).limit(60).lean();
  return docs.map((d) => ({ computedAt: new Date(d.computedAt).toISOString(), kind: d.kind, modelVersion: d.modelVersion ?? null, result: d.result as RippleResult }));
}

export function airportsFor(result: RippleResult) {
  const codes = new Set<string>([result.flight.origin, result.flight.destination]);
  for (const l of result.rotation.legs) {
    codes.add(l.origin);
    codes.add(l.destination);
  }
  const out: RippleResponse["airports"] = {};
  for (const c of codes) {
    const a = getAirport(c);
    out[c] = { tz: a?.tz ?? "UTC", city: a?.city ?? null, name: a?.name ?? c };
  }
  return out;
}

export function airlineName(code: string) {
  return getAirline(code)?.name ?? code;
}
