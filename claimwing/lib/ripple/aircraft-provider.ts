import "server-only";
import { DateTime } from "luxon";
import { env } from "@/lib/env";
import { getAirport } from "@/lib/reference";
import { cached } from "@/lib/providers/cache";
import { parseUtcish } from "@/lib/providers/schedule";
import { ProviderError } from "@/lib/providers/types";
import type { AircraftLeg, LegStatus } from "./rotation";

/**
 * Provider-neutral source of "every leg flown by aircraft X on day D".
 *
 * Capabilities today:
 * - AeroDataBox: GET /flights/reg/{registration}/{dateLocal} lists an aircraft's legs for a day,
 *   with scheduled, revised and runway times. This is what rotation tracking needs.
 * - AviationStack: can return a flight's registration, but has no search by registration on the
 *   plans ClaimWing targets, so rotations are reported as unavailable.
 * - ADS-B (airplanes.live, OpenSky): live positions only; no schedules or leg lists.
 *
 * Results are cached for every user following the same aircraft, so many viewers cost one request.
 */
export type AircraftLookup =
  | { status: "ok"; legs: AircraftLeg[]; source: string; fetchedAt: Date }
  | { status: "unsupported" | "not_configured"; reason: string }
  | { status: "error"; reason: string };

export function aircraftLookupCapability(): "available" | "unsupported" | "not_configured" {
  const p = env.scheduleProvider();
  if (p === "aerodatabox") return env.aerodataboxKey() ? "available" : "not_configured";
  if (p === "aviationstack") return "unsupported";
  return "not_configured";
}

type AdbTime = { utc?: string; local?: string } | string | undefined;
type AdbLeg = {
  number?: string;
  status?: string;
  departure?: { airport?: { iata?: string }; scheduledTime?: AdbTime; revisedTime?: AdbTime; runwayTime?: AdbTime };
  arrival?: { airport?: { iata?: string }; scheduledTime?: AdbTime; revisedTime?: AdbTime; runwayTime?: AdbTime; predictedTime?: AdbTime };
  aircraft?: { reg?: string; model?: string };
};

const t = (x: AdbTime) => parseUtcish(typeof x === "string" ? x : x?.utc);

function legStatus(s?: string): LegStatus {
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
    case "unknown":
      return "unknown";
    default:
      return "scheduled";
  }
}

export function parseAeroDataBoxLegs(body: unknown, registration: string, fetchedAt: Date): AircraftLeg[] {
  const list = (Array.isArray(body) ? body : body ? [body] : []) as AdbLeg[];
  const legs: AircraftLeg[] = [];
  for (const f of list) {
    const origin = f.departure?.airport?.iata;
    const destination = f.arrival?.airport?.iata;
    const sd = t(f.departure?.scheduledTime);
    const sa = t(f.arrival?.scheduledTime);
    if (!origin || !destination || !sd || !sa || !f.number) continue;
    const status = legStatus(f.status);
    const revisedDep = t(f.departure?.revisedTime);
    const revisedArr = t(f.arrival?.revisedTime);
    const tz = getAirport(origin)?.tz ?? "UTC";
    legs.push({
      flightNumber: f.number.replace(/\s+/g, ""),
      date: DateTime.fromJSDate(sd).setZone(tz).toFormat("yyyy-LL-dd"),
      origin,
      destination,
      scheduledDeparture: sd,
      scheduledArrival: sa,
      estimatedDeparture: status === "scheduled" ? revisedDep : null,
      estimatedArrival: status === "landed" ? null : revisedArr ?? t(f.arrival?.predictedTime),
      actualDeparture: status === "in_air" || status === "landed" ? revisedDep ?? t(f.departure?.runwayTime) : null,
      actualArrival: status === "landed" ? revisedArr ?? t(f.arrival?.runwayTime) : null,
      status,
      // Only trust the registration the provider attaches to each leg.
      registration: f.aircraft?.reg ? f.aircraft.reg.toUpperCase() : registration.toUpperCase(),
      aircraftModel: f.aircraft?.model ?? null,
      source: "AeroDataBox (aircraft schedule)",
      observedAt: fetchedAt,
    });
  }
  return legs;
}

async function fetchAeroDataBox(registration: string, dateLocal: string): Promise<AircraftLeg[]> {
  const key = env.aerodataboxKey();
  const host = env.aerodataboxHost();
  const url = `https://${host}/flights/reg/${encodeURIComponent(registration)}/${dateLocal}?withAircraftImage=false&withLocation=false`;
  let lastErr: unknown = null;
  // One retry on network errors or 5xx; never on 4xx or quota errors.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (res.status === 204 || res.status === 404) return [];
      if (res.status === 429) throw new ProviderError("AeroDataBox", "quota or rate limit reached", 60);
      if (res.status === 401 || res.status === 403) throw new ProviderError("AeroDataBox", "API key rejected or not subscribed");
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new ProviderError("AeroDataBox", `HTTP ${res.status}`);
      const text = await res.text();
      return text ? parseAeroDataBoxLegs(JSON.parse(text), registration, new Date()) : [];
    } catch (e) {
      lastErr = e;
      if (e instanceof ProviderError) throw e;
    }
  }
  throw new ProviderError("AeroDataBox", lastErr instanceof Error ? lastErr.message : "request failed");
}

/** Legs for an aircraft on the flight's local date, plus the day before for early-morning departures. */
export async function aircraftLegs(registration: string, dateLocal: string, departureLocalHour: number): Promise<AircraftLookup> {
  const cap = aircraftLookupCapability();
  if (cap === "unsupported") return { status: "unsupported", reason: "The configured schedule provider can't list the flights an aircraft operates, so the incoming flight can't be identified." };
  if (cap === "not_configured") return { status: "not_configured", reason: "No provider for aircraft schedules is configured (set AERODATABOX_RAPIDAPI_KEY)." };
  const reg = registration.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!reg) return { status: "error", reason: "Invalid registration." };
  const days = [dateLocal];
  if (departureLocalHour < 10) days.unshift(DateTime.fromISO(dateLocal).minus({ days: 1 }).toISODate()!);
  try {
    const all: AircraftLeg[] = [];
    for (const d of days) {
      const legs = await cached(`acft:${reg}:${d}`, env.scheduleTtlSeconds(), () => fetchAeroDataBox(reg, d));
      // Cached values come back from MongoDB with Dates intact; from L1 they are untouched.
      all.push(...legs.map(revive));
    }
    const seen = new Set<string>();
    const unique = all.filter((l) => {
      const k = `${l.flightNumber}|${l.origin}|${new Date(l.scheduledDeparture).toISOString()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { status: "ok", legs: unique, source: "AeroDataBox (aircraft schedule)", fetchedAt: unique[0]?.observedAt ?? new Date() };
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.message : String(e) };
  }
}

function revive(l: AircraftLeg): AircraftLeg {
  const d = (v: unknown) => (v ? new Date(v as string) : null);
  return {
    ...l,
    scheduledDeparture: new Date(l.scheduledDeparture),
    scheduledArrival: new Date(l.scheduledArrival),
    estimatedDeparture: d(l.estimatedDeparture),
    estimatedArrival: d(l.estimatedArrival),
    actualDeparture: d(l.actualDeparture),
    actualArrival: d(l.actualArrival),
    observedAt: new Date(l.observedAt),
  };
}
