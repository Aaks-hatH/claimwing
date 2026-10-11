import "server-only";
import { DateTime } from "luxon";
import { env } from "@/lib/env";
import { getAirport } from "@/lib/reference";
import { cached } from "./cache";
import { ProviderError, type FlightDataProvider, type NormalizedStatus, type ScheduleInfo } from "./types";

/* ------------------------------ AeroDataBox ------------------------------ */
/**
 * GET /flights/number/{flightNumber}/{dateLocal} via RapidAPI.
 * Returns scheduled, revised (actual or latest estimate) and runway times, plus the aircraft's Mode-S hex.
 * Field names differ slightly between API versions, so parsing is defensive.
 */
type AdbTime = { utc?: string; local?: string } | string | undefined;
type AdbMovement = {
  airport?: { iata?: string; icao?: string };
  scheduledTime?: AdbTime;
  scheduledTimeUtc?: string;
  revisedTime?: AdbTime;
  actualTimeUtc?: string;
  predictedTime?: AdbTime;
  runwayTime?: AdbTime;
  runwayTimeUtc?: string;
  quality?: string[];
};
type AdbFlight = {
  number?: string;
  status?: string;
  callSign?: string;
  departure?: AdbMovement;
  arrival?: AdbMovement;
  aircraft?: { reg?: string; modeS?: string; model?: string };
};

/** Parses "2026-10-10 14:05Z", "2026-10-10T14:05:00Z" or "2026-10-10 15:05+01:00"; bare times are UTC. */
export function parseUtcish(s: string | null | undefined): Date | null {
  if (!s) return null;
  const norm = s.trim().replace(" ", "T");
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(norm);
  const d = new Date(hasZone ? norm : `${norm}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function adbTime(t: AdbTime, fallback?: string): Date | null {
  const s = typeof t === "string" ? t : t?.utc ?? fallback;
  return parseUtcish(s);
}

function adbStatus(s?: string): NormalizedStatus {
  switch ((s ?? "").toLowerCase()) {
    case "arrived":
      return "landed";
    case "enroute":
    case "departed":
    case "approaching":
      return "in_air";
    case "canceled":
    case "cancelled":
    case "canceleduncertain":
      return "cancelled";
    case "diverted":
      return "diverted";
    case "expected":
    case "checkin":
    case "boarding":
    case "gateclosed":
    case "delayed":
      return "scheduled";
    default:
      return "unknown";
  }
}

async function adbLegs(flightNumber: string, dateLocal: string): Promise<AdbFlight[]> {
  const key = env.aerodataboxKey();
  if (!key) return [];
  const host = env.aerodataboxHost();
  const url = `https://${host}/flights/number/${encodeURIComponent(flightNumber)}/${dateLocal}?withAircraftImage=false&withLocation=false`;
  const res = await fetch(url, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (res.status === 204 || res.status === 404) return [];
  if (res.status === 429) throw new ProviderError("AeroDataBox", "quota or rate limit reached", 60);
  if (res.status === 401 || res.status === 403) throw new ProviderError("AeroDataBox", "API key rejected or not subscribed");
  if (!res.ok) throw new ProviderError("AeroDataBox", `HTTP ${res.status}`);
  const text = await res.text();
  if (!text) return [];
  const list = JSON.parse(text) as AdbFlight[] | AdbFlight;
  return Array.isArray(list) ? list : [list];
}

function adbInfo(pick: AdbFlight, origin?: string): ScheduleInfo {
  const status = adbStatus(pick.status);
  const dep = pick.departure ?? {};
  const arr = pick.arrival ?? {};
  const revisedArr = adbTime(arr.revisedTime, arr.actualTimeUtc);
  const revisedDep = adbTime(dep.revisedTime, dep.actualTimeUtc);
  const notes: string[] = [];
  if (pick.departure?.airport?.iata && origin && pick.departure.airport.iata !== origin) {
    notes.push(`AeroDataBox lists this flight from ${pick.departure.airport.iata}, not ${origin}.`);
  }
  return {
    source: "schedule API (AeroDataBox)",
    status: pick.status ?? null,
    normalizedStatus: status,
    origin: dep.airport?.iata ?? null,
    destination: arr.airport?.iata ?? null,
    scheduledDeparture: adbTime(dep.scheduledTime, dep.scheduledTimeUtc),
    scheduledArrival: adbTime(arr.scheduledTime, arr.scheduledTimeUtc),
    // "Revised" is the actual time once the flight has moved, otherwise the latest estimate.
    gateDeparture: status === "in_air" || status === "landed" ? revisedDep : null,
    runwayDeparture: adbTime(dep.runwayTime, dep.runwayTimeUtc),
    gateArrival: status === "landed" ? revisedArr : null,
    runwayArrival: adbTime(arr.runwayTime, arr.runwayTimeUtc),
    estimatedArrival: status === "landed" ? null : revisedArr ?? adbTime(arr.predictedTime),
    icao24: pick.aircraft?.modeS?.toLowerCase() ?? null,
    registration: pick.aircraft?.reg ?? null,
    callsign: pick.callSign ?? null,
    aircraftModel: pick.aircraft?.model ?? null,
    notes,
  };
}

/** Same flight number can come back for several days or legs. Never accept one that is far from the trip's own departure. */
const MAX_DEPARTURE_DRIFT_MS = 12 * 3600_000;

function closestToExpected<T>(items: T[], depOf: (x: T) => Date | null, expected?: Date): T[] {
  if (!expected) return items;
  return items
    .map((x) => ({ x, d: depOf(x) }))
    .filter((e): e is { x: T; d: Date } => e.d !== null && Math.abs(e.d.getTime() - expected.getTime()) <= MAX_DEPARTURE_DRIFT_MS)
    .sort((a, b) => Math.abs(a.d.getTime() - expected.getTime()) - Math.abs(b.d.getTime() - expected.getTime()))
    .map((e) => e.x);
}

async function aerodatabox(flightNumber: string, dateLocal: string, origin?: string, destination?: string, expectedDeparture?: Date): Promise<ScheduleInfo | null> {
  const flights = await adbLegs(flightNumber, dateLocal);
  const candidates = closestToExpected(flights, (f) => adbTime(f.departure?.scheduledTime, f.departure?.scheduledTimeUtc), expectedDeparture);
  const pick =
    candidates.find((f) => f.departure?.airport?.iata === origin && f.arrival?.airport?.iata === destination) ??
    candidates.find((f) => f.departure?.airport?.iata === origin) ??
    candidates.find((f) => f.arrival?.airport?.iata === destination) ??
    (expectedDeparture ? candidates[0] : flights[0]);
  return pick ? adbInfo(pick, origin) : null;
}

async function aerodataboxOptions(flightNumber: string, dateLocal: string): Promise<ScheduleInfo[]> {
  return (await adbLegs(flightNumber, dateLocal)).map((f) => adbInfo(f));
}

/* ------------------------------ AviationStack ------------------------------ */
/**
 * GET /v1/flights?flight_iata=…: the free plan is HTTP-only with a small monthly quota.
 * Known quirk: times are labelled "+00:00" but are the airport's local clock time,
 * so we re-interpret them in each airport's time zone.
 */
type AsMove = { iata?: string; scheduled?: string; estimated?: string; actual?: string; actual_runway?: string; estimated_runway?: string };
type AsFlight = {
  flight_date?: string;
  flight_status?: string;
  departure?: AsMove;
  arrival?: AsMove;
  aircraft?: { registration?: string; icao24?: string; iata?: string } | null;
  flight?: { icao?: string };
};

function asLocal(s: string | undefined, iata: string | undefined): Date | null {
  if (!s) return null;
  const wall = s.slice(0, 19); // drop the misleading offset
  const tz = getAirport(iata)?.tz ?? "UTC";
  const dt = DateTime.fromISO(wall, { zone: tz });
  return dt.isValid ? dt.toUTC().toJSDate() : null;
}

function asStatus(s?: string): NormalizedStatus {
  switch (s) {
    case "landed":
      return "landed";
    case "active":
      return "in_air";
    case "cancelled":
      return "cancelled";
    case "diverted":
      return "diverted";
    case "scheduled":
      return "scheduled";
    default:
      return "unknown";
  }
}

async function asFlights(flightNumber: string): Promise<AsFlight[]> {
  const key = env.aviationstackKey();
  if (!key) return [];
  const base = process.env.AVIATIONSTACK_BASE_URL || "http://api.aviationstack.com/v1";
  const res = await fetch(`${base}/flights?access_key=${encodeURIComponent(key)}&flight_iata=${encodeURIComponent(flightNumber)}`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new ProviderError("AviationStack", `HTTP ${res.status}`);
  const body = (await res.json()) as { data?: AsFlight[]; error?: { message?: string } };
  if (body.error) throw new ProviderError("AviationStack", body.error.message ?? "error");
  return body.data ?? [];
}

function asInfo(f: AsFlight): ScheduleInfo {
  const status = asStatus(f.flight_status);
  return {
    source: "schedule API (AviationStack)",
    status: f.flight_status ?? null,
    normalizedStatus: status,
    origin: f.departure?.iata ?? null,
    destination: f.arrival?.iata ?? null,
    scheduledDeparture: asLocal(f.departure?.scheduled, f.departure?.iata),
    scheduledArrival: asLocal(f.arrival?.scheduled, f.arrival?.iata),
    gateDeparture: asLocal(f.departure?.actual, f.departure?.iata),
    runwayDeparture: asLocal(f.departure?.actual_runway, f.departure?.iata),
    gateArrival: status === "landed" ? asLocal(f.arrival?.actual, f.arrival?.iata) : null,
    runwayArrival: asLocal(f.arrival?.actual_runway, f.arrival?.iata),
    estimatedArrival: asLocal(f.arrival?.estimated ?? f.arrival?.estimated_runway, f.arrival?.iata),
    icao24: f.aircraft?.icao24?.toLowerCase() ?? null,
    registration: f.aircraft?.registration ?? null,
    callsign: f.flight?.icao ?? null,
    aircraftModel: f.aircraft?.iata ?? null,
    notes: [],
  };
}

async function aviationstack(flightNumber: string, dateLocal: string, origin?: string, destination?: string, expectedDeparture?: Date): Promise<ScheduleInfo | null> {
  const all = (await asFlights(flightNumber)).filter((x) => x.flight_date === dateLocal);
  const candidates = closestToExpected(all, (x) => asLocal(x.departure?.scheduled, x.departure?.iata), expectedDeparture);
  const f =
    candidates.find((x) => x.departure?.iata === origin && x.arrival?.iata === destination) ??
    candidates[0];
  return f ? asInfo(f) : null;
}

async function aviationstackOptions(flightNumber: string, dateLocal: string): Promise<ScheduleInfo[]> {
  return (await asFlights(flightNumber)).filter((x) => x.flight_date === dateLocal).map(asInfo);
}

export const AeroDataBoxProvider: FlightDataProvider = { name: "AeroDataBox", kind: "schedule", getSchedule: aerodatabox, getScheduleOptions: aerodataboxOptions };
export const AviationStackProvider: FlightDataProvider = { name: "AviationStack", kind: "schedule", getSchedule: aviationstack, getScheduleOptions: aviationstackOptions };

export function scheduleProvider(): FlightDataProvider | null {
  switch (env.scheduleProvider()) {
    case "aerodatabox":
      return AeroDataBoxProvider;
    case "aviationstack":
      return AviationStackProvider;
    default:
      return null;
  }
}

/** Cached schedule lookup shared across users watching the same flight. Pass the trip's own departure so a different day's leg is never used. */
export async function getScheduleCached(
  flightNumber: string,
  dateLocal: string,
  origin: string,
  destination: string,
  ttlSeconds: number,
  expectedDeparture?: Date,
): Promise<ScheduleInfo | null> {
  const p = scheduleProvider();
  if (!p?.getSchedule) return null;
  const dep = expectedDeparture ? expectedDeparture.toISOString() : "any";
  return cached(`sched:${p.name}:${flightNumber}:${dateLocal}:${origin}-${destination}:${dep}`, ttlSeconds, () =>
    p.getSchedule!(flightNumber, dateLocal, origin, destination, expectedDeparture),
  );
}
