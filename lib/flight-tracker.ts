import "server-only";
import type { Types } from "mongoose";
import { connectDB } from "./db";
import { env } from "./env";
import { FlightOutcome, FlightSnapshot, Trip, type TripDoc, type TimeEvidence } from "@/models";
import { getAirport, callsignFor } from "./reference";
import { greatCircleKm } from "./rules/geo";
import { getLivePosition } from "./providers/adsb";
import { getScheduleCached } from "./providers/schedule";
import { loadReplay, replayInstant, replayMinute, replayPosition, replaySchedule, type ReplayClock } from "./providers/replay";
import type { PositionReport, ScheduleInfo } from "./providers/types";
import { notify } from "./notifications";
import { invalidate } from "./providers/cache";
import { tripFlightKey } from "./ripple/flight-id";
import { minutesBetween, formatDuration } from "./time";

type EvidenceKind = TimeEvidence["kind"];

/** Priority for choosing the arrival time used in the delay calculation. */
const ARRIVAL_PRIORITY: EvidenceKind[] = ["manual_arrival", "gate_arrival", "runway_arrival", "adsb_on_ground", "adsb_last_contact"];
const DEPARTURE_PRIORITY: EvidenceKind[] = ["manual_departure", "gate_departure", "runway_departure", "adsb_airborne"];

const KIND_LABEL: Record<EvidenceKind, string> = {
  gate_arrival: "gate arrival",
  runway_arrival: "runway touchdown",
  estimated_arrival: "estimated arrival",
  adsb_on_ground: "first on-ground position after landing",
  adsb_last_contact: "last position before landing (approximate)",
  gate_departure: "gate departure",
  runway_departure: "takeoff",
  adsb_airborne: "first airborne position",
  manual_arrival: "arrival time you entered",
  manual_departure: "departure time you entered",
};

export function evidenceLabel(kind: string) {
  return KIND_LABEL[kind as EvidenceKind] ?? kind;
}

export function chooseArrival(evidence: TimeEvidence[]) {
  for (const k of ARRIVAL_PRIORITY) {
    const e = evidence.filter((x) => x.kind === k).sort((a, b) => +new Date(b.recordedAt ?? 0) - +new Date(a.recordedAt ?? 0))[0];
    if (e) return e;
  }
  return null;
}

export function chooseDeparture(evidence: TimeEvidence[]) {
  for (const k of DEPARTURE_PRIORITY) {
    const e = evidence.find((x) => x.kind === k);
    if (e) return e;
  }
  return null;
}

function upsertEvidence(list: TimeEvidence[], e: Omit<TimeEvidence, "recordedAt">): boolean {
  const i = list.findIndex((x) => x.kind === e.kind && x.source === e.source);
  if (i === -1) {
    list.push({ ...e, recordedAt: new Date() } as TimeEvidence);
    return true;
  }
  if (Math.abs(new Date(list[i].time).getTime() - e.time.getTime()) >= 60_000) {
    list[i] = { ...e, recordedAt: new Date() } as TimeEvidence;
    return true;
  }
  return false;
}

export type TrackerState = Awaited<ReturnType<typeof buildState>>;

/**
 * Polls external sources for one trip (respecting caches and quotas), stores what it learns,
 * and returns the current state for the Flight tab. Safe to call often: it throttles itself.
 */
export async function pollTrip(tripId: string | Types.ObjectId, userId: string | Types.ObjectId, opts: { force?: boolean } = {}) {
  await connectDB();
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) return null;

  const realNow = new Date();
  const replay = trip.demoMode && trip.replay?.file ? await loadReplay(trip.replay.file).catch(() => null) : null;
  const clock: ReplayClock | null =
    replay && trip.replay?.startedAt
      ? { scheduledDeparture: trip.scheduledDeparture, startedAt: trip.replay.startedAt, speed: trip.replay.speed ?? 60, startOffsetMin: replay.gateDepartureMin - 10 }
      : null;
  const now = clock ? replayInstant(clock, replayMinute(clock, realNow)) : realNow;

  const minInterval = clock ? 2_000 : 15_000;
  const last = trip.tracking?.lastPolledAt ? new Date(trip.tracking.lastPolledAt).getTime() : 0;
  if (trip.tracking?.finalizedAt || (!opts.force && realNow.getTime() - last < minInterval)) {
    return buildState(trip, now, []);
  }

  const errors: string[] = [];
  const outcome =
    (await FlightOutcome.findOne({ tripId: trip._id, userId })) ??
    new FlightOutcome({ tripId: trip._id, userId, disruption: "delay", evidence: [] });
  const evidence = outcome.evidence as unknown as TimeEvidence[];

  const dest = getAirport(trip.destination);
  const orig = getAirport(trip.origin);
  const schedDep = new Date(trip.scheduledDeparture);
  const schedArr = new Date(trip.scheduledArrival);
  const tracking = trip.tracking ?? ({} as NonNullable<TripDoc["tracking"]>);

  /* ---------- 1. Schedule API (or replay schedule) ---------- */
  let schedule: ScheduleInfo | null = null;
  const scheduleWindow = now.getTime() > schedDep.getTime() - 24 * 3600_000 && now.getTime() < schedArr.getTime() + 36 * 3600_000;
  if (replay && clock) {
    schedule = replaySchedule(replay, clock, realNow);
  } else if (scheduleWindow && env.scheduleProvider() !== "none") {
    const inFlight = now >= new Date(schedDep.getTime() - 3600_000) && now <= new Date(schedArr.getTime() + 6 * 3600_000);
    const ttl = inFlight ? env.scheduleTtlSeconds() : Math.max(env.scheduleTtlSeconds(), 3600);
    try {
      schedule = await getScheduleCached(trip.flightNumber, trip.flightDate, trip.origin, trip.destination, ttl, schedDep);
      tracking.lastScheduleFetchAt = realNow;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (schedule) {
    const src = schedule.source;
    if (schedule.gateDeparture) upsertEvidence(evidence, { kind: "gate_departure", time: schedule.gateDeparture, source: src, note: "Actual departure as reported" });
    if (schedule.runwayDeparture) upsertEvidence(evidence, { kind: "runway_departure", time: schedule.runwayDeparture, source: src, note: "Takeoff time as reported" });
    if (schedule.gateArrival) upsertEvidence(evidence, { kind: "gate_arrival", time: schedule.gateArrival, source: src, note: "Actual arrival as reported" });
    if (schedule.runwayArrival) upsertEvidence(evidence, { kind: "runway_arrival", time: schedule.runwayArrival, source: src, note: "Touchdown time as reported" });
    if (schedule.estimatedArrival) {
      tracking.estimatedArrival = schedule.estimatedArrival;
      tracking.estimatedArrivalSource = src;
    }
    if (schedule.icao24 && !tracking.icao24) {
      tracking.icao24 = schedule.icao24;
      tracking.icao24Source = src;
    }
    if (schedule.callsign && !tracking.callsign) tracking.callsign = schedule.callsign;
    if (schedule.registration) {
      const changed = recordAircraft(trip, schedule.registration, schedule.aircraftModel, src, realNow);
      // A new aircraft invalidates any rotation Flight Ripple built for this flight.
      if (changed) await invalidate(`ripple:v1:${tripFlightKey(trip)}`).catch(() => undefined);
    }
    outcome.scheduleStatus = schedule.status ?? undefined;
    if (schedule.normalizedStatus === "cancelled") outcome.disruption = "cancellation";
    if (schedule.normalizedStatus !== "unknown") tracking.status = schedule.normalizedStatus;
    if (schedule.normalizedStatus === "landed") tracking.estimatedArrival = undefined;
  }

  /* ---------- 2. Live position (ADS-B) ---------- */
  const latestEstimate = tracking.estimatedArrival ? new Date(tracking.estimatedArrival) : schedArr;
  const adsbWindowOpen =
    now.getTime() > schedDep.getTime() - 3600_000 &&
    now.getTime() < Math.max(schedArr.getTime(), latestEstimate.getTime()) + 4 * 3600_000 &&
    tracking.status !== "cancelled";
  let position: PositionReport | null = null;
  const callsign = tracking.callsign || callsignFor(trip.flightNumber);
  if (!tracking.callsign && callsign) tracking.callsign = callsign;

  if (adsbWindowOpen && !hasFinalArrival(evidence)) {
    if (replay && clock) {
      position = replayPosition(replay, clock, realNow);
    } else {
      const r = await getLivePosition({ icao24: tracking.icao24, callsign });
      position = r.position;
      errors.push(...r.errors);
    }
    if (position) {
      if (!tracking.icao24) {
        tracking.icao24 = position.icao24;
        tracking.icao24Source = `matched by callsign ${callsign} (${position.source})`;
      }
      const prev = await FlightSnapshot.findOne({ tripId: trip._id }).sort({ observedAt: -1 }).lean();
      if (!prev || new Date(prev.observedAt).getTime() !== position.observedAt.getTime()) {
        await FlightSnapshot.create({
          tripId: trip._id,
          userId,
          polledAt: realNow,
          observedAt: position.observedAt,
          lat: position.lat,
          lon: position.lon,
          altitude: position.altitude,
          velocity: position.velocity,
          track: position.track,
          verticalRate: position.verticalRate,
          onGround: position.onGround,
          icao24: position.icao24,
          callsign: position.callsign,
          source: position.source,
          raw: position.raw,
        });
      }
      tracking.lastPositionAt = position.observedAt;
    }
    await detectFromTrack(trip._id, evidence, dest, orig, position, now);
  }

  // ETA from position when there is no schedule estimate.
  if (position && !position.onGround && dest && (position.velocity ?? 0) > 50 && !schedule?.estimatedArrival) {
    const km = greatCircleKm(position, dest);
    tracking.estimatedArrival = new Date(position.observedAt.getTime() + (km * 1000) / position.velocity! * 1000 + 8 * 60_000);
    tracking.estimatedArrivalSource = `estimate from live position (${position.source})`;
  }

  /* ---------- 3. Outcome ---------- */
  const arrival = chooseArrival(evidence);
  const departure = chooseDeparture(evidence);
  if (departure) outcome.actualDeparture = departure.time;
  if (arrival) {
    outcome.actualArrival = arrival.time;
    outcome.delayMinutes = minutesBetween(schedArr, arrival.time);
    outcome.delaySource = `${arrival.source}, ${evidenceLabel(arrival.kind)}`;
    outcome.delayKind = arrival.kind;
    if (tracking.status !== "diverted") tracking.status = "landed";
  } else if (!schedule && position) {
    tracking.status = position.onGround ? (departure ? "landed" : "scheduled") : "in_air";
  }
  outcome.markModified("evidence");

  /* ---------- 4. Alerts ---------- */
  const user = { id: userId };
  const estimatedDelay = tracking.estimatedArrival ? minutesBetween(schedArr, tracking.estimatedArrival) : null;
  if (!tracking.alertSentAt && estimatedDelay !== null && estimatedDelay >= 150 && tracking.status !== "landed") {
    tracking.alertSentAt = realNow;
    await notify(user.id, {
      type: "delay_alert",
      title: `${trip.flightNumber} may qualify for compensation`,
      message: `Expected about ${formatDuration(estimatedDelay)} late. Check what the airline owes you while you wait.`,
      href: `/app/trips/${trip._id}?tab=flight`,
      dedupeKey: `delay_alert:${trip._id}`,
    });
  }
  if (arrival && (outcome.delayMinutes ?? 0) >= 150) {
    await notify(user.id, {
      type: "landed",
      title: `${trip.flightNumber} arrived ${formatDuration(outcome.delayMinutes)} late`,
      message: "Your delay evidence is saved. Review eligibility and start a claim.",
      href: `/app/trips/${trip._id}?tab=claim`,
      dedupeKey: `landed_late:${trip._id}`,
    });
  }
  if (tracking.status === "cancelled") {
    await notify(user.id, {
      type: "delay_alert",
      title: `${trip.flightNumber} was cancelled`,
      message: "Record when you were told and whether you were offered another flight to check compensation.",
      href: `/app/trips/${trip._id}?tab=flight`,
      dedupeKey: `cancelled:${trip._id}`,
    });
  }

  /* ---------- 5. Finalize ---------- */
  const gateKnown = evidence.some((e) => e.kind === "gate_arrival" || e.kind === "manual_arrival");
  const noScheduleApi = !replay && env.scheduleProvider() === "none";
  if (
    (arrival && (gateKnown || noScheduleApi) && now.getTime() > new Date(arrival.time).getTime() + 30 * 60_000) ||
    (tracking.status === "cancelled" && now.getTime() > schedArr.getTime() + 6 * 3600_000) ||
    now.getTime() > schedArr.getTime() + 48 * 3600_000
  ) {
    tracking.finalizedAt = realNow;
  }

  tracking.lastPolledAt = realNow;
  tracking.lastError = errors.length ? errors.join("; ").slice(0, 500) : undefined;
  trip.tracking = tracking;
  trip.markModified("tracking");
  await Promise.all([trip.save(), outcome.save()]);
  return buildState(trip, now, errors);
}

/** Stores the aircraft assigned to the flight and keeps a history so swaps can be detected. */
function recordAircraft(trip: InstanceType<typeof Trip>, registration: string, model: string | null, source: string, at: Date): boolean {
  const reg = registration.toUpperCase().trim();
  const a = trip.aircraft ?? { history: [] };
  const history = a.history ?? [];
  const changed = a.registration !== reg;
  if (changed) history.push({ registration: reg, source, firstSeenAt: at });
  trip.aircraft = { registration: reg, model: model ?? a.model ?? null, source, seenAt: at, history: history.slice(-10) };
  trip.markModified("aircraft");
  return changed;
}

function hasFinalArrival(evidence: TimeEvidence[]) {
  return evidence.some((e) => e.kind === "gate_arrival" || e.kind === "manual_arrival");
}

/** Detects takeoff and landing from the stored ADS-B track. */
async function detectFromTrack(
  tripId: Types.ObjectId,
  evidence: TimeEvidence[],
  dest: ReturnType<typeof getAirport>,
  orig: ReturnType<typeof getAirport>,
  current: PositionReport | null,
  now: Date,
) {
  const snaps = await FlightSnapshot.find({ tripId }).sort({ observedAt: 1 }).select("observedAt lat lon altitude onGround source").lean();
  if (!snaps.length) return;
  const source = snaps[snaps.length - 1].source;

  // Takeoff: first airborne report after being on the ground near the origin (or simply the first airborne report).
  const firstAir = snaps.find((s) => !s.onGround && (s.altitude ?? 0) > 100);
  if (firstAir && !evidence.some((e) => e.kind === "adsb_airborne")) {
    const nearOrigin = orig ? greatCircleKm(firstAir as { lat: number; lon: number }, orig) < 40 : false;
    upsertEvidence(evidence, {
      kind: "adsb_airborne",
      time: new Date(firstAir.observedAt),
      source,
      note: nearOrigin ? "First airborne position near the departure airport" : "First airborne position we observed (takeoff may have been earlier)",
    });
  }

  if (!dest || !firstAir) return;
  // Landing: first on-ground report near the destination after having been airborne.
  const afterAir = snaps.filter((s) => new Date(s.observedAt) > new Date(firstAir.observedAt));
  const landed = afterAir.find((s) => s.onGround && greatCircleKm(s as { lat: number; lon: number }, dest) < 15);
  if (landed) {
    upsertEvidence(evidence, {
      kind: "adsb_on_ground",
      time: new Date(landed.observedAt),
      source,
      note: `On the ground ${greatCircleKm(landed as { lat: number; lon: number }, dest).toFixed(1)} km from ${dest.iata}`,
    });
    return;
  }
  // Coverage often ends at low altitude. If the last report was low and close to the destination
  // and nothing newer has been seen for 10 minutes, record it as an approximate landing.
  const lastSnap = snaps[snaps.length - 1];
  const stale = now.getTime() - new Date(lastSnap.observedAt).getTime() > 10 * 60_000;
  if (
    !current &&
    stale &&
    !lastSnap.onGround &&
    (lastSnap.altitude ?? 1e9) < 1200 &&
    greatCircleKm(lastSnap as { lat: number; lon: number }, dest) < 30
  ) {
    upsertEvidence(evidence, {
      kind: "adsb_last_contact",
      time: new Date(lastSnap.observedAt),
      source,
      note: `Last seen at ${Math.round(lastSnap.altitude ?? 0)} m, ${greatCircleKm(lastSnap as { lat: number; lon: number }, dest).toFixed(0)} km from ${dest.iata}; actual landing was a few minutes later`,
    });
  }
}

/** Everything the Flight tab needs, without calling external APIs. */
export async function getTrackerState(tripId: string, userId: string | Types.ObjectId) {
  await connectDB();
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) return null;
  let now = new Date();
  if (trip.demoMode && trip.replay?.file && trip.replay.startedAt) {
    const r = await loadReplay(trip.replay.file).catch(() => null);
    if (r) {
      const clock = { scheduledDeparture: trip.scheduledDeparture, startedAt: trip.replay.startedAt, speed: trip.replay.speed ?? 60, startOffsetMin: r.gateDepartureMin - 10 };
      now = replayInstant(clock, replayMinute(clock));
    }
  }
  return buildState(trip, now, []);
}

async function buildState(trip: InstanceType<typeof Trip>, now: Date, errors: string[]) {
  const outcome = await FlightOutcome.findOne({ tripId: trip._id }).lean();
  const snaps = await FlightSnapshot.find({ tripId: trip._id })
    .sort({ observedAt: 1 })
    .select("observedAt lat lon altitude velocity track onGround source")
    .lean();
  const step = Math.max(1, Math.ceil(snaps.length / 800));
  const track = snaps
    .filter((_, i) => i % step === 0 || i === snaps.length - 1)
    .map((s) => ({
      t: new Date(s.observedAt).toISOString(),
      lat: s.lat as number,
      lon: s.lon as number,
      alt: s.altitude ?? null,
      gs: s.velocity ?? null,
      trk: s.track ?? null,
      gnd: Boolean(s.onGround),
    }));
  const t = trip.tracking ?? {};
  const schedArr = new Date(trip.scheduledArrival);
  const estimatedDelay = t.estimatedArrival ? minutesBetween(schedArr, t.estimatedArrival) : null;
  const finalized = Boolean(t.finalizedAt);
  const schedDep = new Date(trip.scheduledDeparture);
  const active =
    !finalized && now.getTime() > schedDep.getTime() - 3 * 3600_000 && now.getTime() < schedArr.getTime() + 48 * 3600_000;
  return {
    tripId: trip._id.toString(),
    demo: Boolean(trip.demoMode),
    now: now.toISOString(),
    status: (t.status ?? "scheduled") as "scheduled" | "in_air" | "landed" | "cancelled" | "diverted" | "unknown",
    icao24: t.icao24 ?? null,
    icao24Source: t.icao24Source ?? null,
    callsign: t.callsign ?? null,
    estimatedArrival: t.estimatedArrival ? new Date(t.estimatedArrival).toISOString() : null,
    estimatedArrivalSource: t.estimatedArrivalSource ?? null,
    estimatedDelayMinutes: estimatedDelay,
    lastPolledAt: t.lastPolledAt ? new Date(t.lastPolledAt).toISOString() : null,
    lastPositionAt: t.lastPositionAt ? new Date(t.lastPositionAt).toISOString() : null,
    finalized,
    active,
    nextPollSeconds: !active ? null : trip.demoMode ? 3 : 20,
    errors: errors.length ? errors : t.lastError ? [t.lastError] : [],
    scheduleProvider: trip.demoMode ? "Demo replay" : env.scheduleProvider(),
    outcome: outcome
      ? {
          disruption: outcome.disruption,
          actualDeparture: outcome.actualDeparture ? new Date(outcome.actualDeparture).toISOString() : null,
          actualArrival: outcome.actualArrival ? new Date(outcome.actualArrival).toISOString() : null,
          delayMinutes: outcome.delayMinutes ?? null,
          delaySource: outcome.delaySource ?? null,
          delayKind: outcome.delayKind ?? null,
          scheduleStatus: outcome.scheduleStatus ?? null,
          cause: outcome.cause,
          evidence: ((outcome.evidence ?? []) as TimeEvidence[])
            .map((e) => ({
              kind: e.kind,
              label: evidenceLabel(e.kind),
              time: new Date(e.time).toISOString(),
              source: e.source,
              note: e.note ?? null,
            }))
            .sort((a, b) => a.time.localeCompare(b.time)),
        }
      : null,
    track,
  };
}
