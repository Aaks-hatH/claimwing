import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FlightDataProvider, PositionReport, ScheduleInfo } from "./types";

/**
 * Replays a stored flight so the full experience works offline (venue Wi-Fi, API outages).
 * Time is compressed: one real second = `speed` flight seconds. Everything the replay
 * produces is labelled "Demo replay" in the UI, the database and the PDF.
 *
 * File format (data/replays/*.json): times are minutes relative to the scheduled departure.
 */
export type ReplayFile = {
  label: string;
  synthetic: boolean;
  flightNumber: string;
  origin: string;
  destination: string;
  icao24: string;
  callsign: string;
  scheduledDurationMin: number;
  gateDepartureMin: number;
  takeoffMin: number;
  touchdownMin: number;
  gateArrivalMin: number;
  cause: string;
  points: Array<{ t: number; lat: number; lon: number; alt: number; gs: number; trk: number; vr: number; gnd: boolean }>;
};

const cache = new Map<string, ReplayFile>();

export async function loadReplay(file: string): Promise<ReplayFile> {
  const safe = path.basename(file);
  const hit = cache.get(safe);
  if (hit) return hit;
  const raw = await readFile(path.join(process.cwd(), "data", "replays", safe), "utf8");
  const parsed = JSON.parse(raw) as ReplayFile;
  cache.set(safe, parsed);
  return parsed;
}

export type ReplayClock = { scheduledDeparture: Date; startedAt: Date; speed: number; startOffsetMin: number };

/** Minutes since scheduled departure in the replayed timeline. */
export function replayMinute(clock: ReplayClock, now = new Date()) {
  return clock.startOffsetMin + ((now.getTime() - clock.startedAt.getTime()) / 60000) * clock.speed;
}

/** Wall-clock instant in the replayed timeline (used for displayed times). */
export function replayInstant(clock: ReplayClock, minute: number) {
  return new Date(clock.scheduledDeparture.getTime() + minute * 60000);
}

export function replayPosition(r: ReplayFile, clock: ReplayClock, now = new Date()): PositionReport | null {
  const m = replayMinute(clock, now);
  const pts = r.points;
  if (!pts.length || m < pts[0].t) return null;
  if (m >= pts[pts.length - 1].t) {
    const p = pts[pts.length - 1];
    return toReport(r, clock, p, p.t);
  }
  const i = pts.findIndex((p) => p.t > m);
  const a = pts[i - 1];
  const b = pts[i];
  const f = (m - a.t) / (b.t - a.t);
  const lerp = (x: number, y: number) => x + (y - x) * f;
  return toReport(
    r,
    clock,
    { t: m, lat: lerp(a.lat, b.lat), lon: lerp(a.lon, b.lon), alt: lerp(a.alt, b.alt), gs: lerp(a.gs, b.gs), trk: b.trk, vr: lerp(a.vr, b.vr), gnd: f < 0.5 ? a.gnd : b.gnd },
    m,
  );
}

function toReport(r: ReplayFile, clock: ReplayClock, p: ReplayFile["points"][number], minute: number): PositionReport {
  return {
    observedAt: replayInstant(clock, minute),
    lat: p.lat,
    lon: p.lon,
    altitude: p.alt,
    velocity: p.gs,
    track: p.trk,
    verticalRate: p.vr,
    onGround: p.gnd,
    icao24: r.icao24,
    callsign: r.callsign,
    source: "Demo replay",
  };
}

export function replaySchedule(r: ReplayFile, clock: ReplayClock, now = new Date()): ScheduleInfo {
  const m = replayMinute(clock, now);
  const at = (min: number) => replayInstant(clock, min);
  const landed = m >= r.gateArrivalMin;
  const inAir = m >= r.takeoffMin && !landed;
  return {
    source: "Demo replay schedule",
    status: landed ? "Arrived" : inAir ? "EnRoute" : "Delayed",
    normalizedStatus: landed ? "landed" : inAir ? "in_air" : "scheduled",
    origin: r.origin,
    destination: r.destination,
    scheduledDeparture: at(0),
    scheduledArrival: at(r.scheduledDurationMin),
    gateDeparture: m >= r.gateDepartureMin ? at(r.gateDepartureMin) : null,
    runwayDeparture: m >= r.takeoffMin ? at(r.takeoffMin) : null,
    gateArrival: landed ? at(r.gateArrivalMin) : null,
    runwayArrival: m >= r.touchdownMin ? at(r.touchdownMin) : null,
    estimatedArrival: landed ? null : at(r.gateArrivalMin),
    icao24: r.icao24,
    registration: null,
    callsign: r.callsign,
    aircraftModel: null,
    notes: [r.synthetic ? "Synthetic demo flight, not a real recording." : "Recorded flight replayed for demonstration."],
  };
}

export const ReplayProvider = (r: ReplayFile, clock: ReplayClock): FlightDataProvider => ({
  name: "Demo replay",
  kind: "replay",
  getPositionByIcao24: async () => replayPosition(r, clock),
  getPositionByCallsign: async () => replayPosition(r, clock),
  getSchedule: async () => replaySchedule(r, clock),
});
