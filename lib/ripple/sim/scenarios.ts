/**
 * Demo Center scenarios for Flight Ripple.
 *
 * Every flight, aircraft, time and passenger report here is invented and labelled as simulated.
 * Nothing is read from or written to the database: frames are computed in memory by the same
 * functions that handle real flights (rotation resolution, report aggregation, propagation, the
 * engine and, where it covers the flight, the trained model). The same inputs always produce the
 * same frames, so restarting a scenario returns to an identical state.
 *
 * Flight numbers use the 9100 to 9199 range of a carrier the 2013 model covers so the model can
 * run on these simulated inputs; the flights themselves don't exist.
 */
import { aggregateReports, type ReportInput, type ReportType } from "../reports";
import { resolveRotation, type AircraftLeg } from "../rotation";
import { computeRipple, diffResults, type EngineFlight, type ProviderState, type RippleChange, type RippleResult } from "../engine";
import type { ModelFlightInput, ModelPrediction, Stage } from "../model-core";

export type Spotlight = "overview" | "why" | "rotation" | "ripple" | "reports" | "quality";

export type SimFrame = {
  index: number;
  at: string;
  label: string;
  narration: string;
  spotlight: Spotlight;
  result: RippleResult;
  changes: RippleChange[];
};

export type ScenarioMeta = {
  id: string;
  title: string;
  summary: string;
  expected: string;
  focusFlight: string;
};

type SimState = {
  now: Date;
  legs: AircraftLeg[];
  targetReg: string | null;
  prevReg: string | null;
  reports: ReportInput[];
  providerErrors: string[];
  scheduleConfigured: boolean;
  aircraftLookup: ProviderState["aircraftLookup"];
  providerUpdatedAt: Date | null;
  weather: { windKmh: number; visibilityKm: number; precipMm: number; tempC: number; severe: boolean; summary: string } | null;
};

type SimEvent = { at: string; label: string; narration: string; spotlight: Spotlight; apply?: (s: SimState) => void };

export type Predictor = (stage: Stage, input: ModelFlightInput) => ModelPrediction;

const DAY = "2026-11-20"; // a Friday
const Z = (hhmm: string, dayOffset = 0) => {
  const d = new Date(`${DAY}T${hhmm}:00Z`);
  return new Date(d.getTime() + dayOffset * 86_400_000);
};
// New York is UTC-5 on this date; Orlando and Buffalo too. Times below are UTC.
const AIRPORTS = {
  BOS: { iata: "BOS", name: "Boston Logan", city: "Boston", tz: "America/New_York" },
  JFK: { iata: "JFK", name: "New York JFK", city: "New York", tz: "America/New_York" },
  MCO: { iata: "MCO", name: "Orlando", city: "Orlando", tz: "America/New_York" },
  BUF: { iata: "BUF", name: "Buffalo", city: "Buffalo", tz: "America/New_York" },
  FLL: { iata: "FLL", name: "Fort Lauderdale", city: "Fort Lauderdale", tz: "America/New_York" },
} as const;
const DIST: Record<string, number> = { "JFK|MCO": 1520, "MCO|JFK": 1520, "BOS|JFK": 301, "JFK|BUF": 484, "MCO|FLL": 285 };

function leg(flightNumber: string, origin: keyof typeof AIRPORTS, destination: keyof typeof AIRPORTS, dep: Date, arr: Date, reg: string): AircraftLeg {
  return {
    flightNumber,
    date: DAY,
    origin,
    destination,
    scheduledDeparture: dep,
    scheduledArrival: arr,
    status: "scheduled",
    registration: reg,
    aircraftModel: "Airbus A320",
    source: "Simulated aircraft schedule",
    observedAt: dep,
  };
}

const TARGET = { flightNumber: "B69102", origin: "JFK", destination: "MCO", dep: Z("20:15"), arr: Z("23:05") } as const;

function baseLegs(): AircraftLeg[] {
  return [
    leg("B69101", "BOS", "JFK", Z("18:00"), Z("19:20"), "N901SM"),
    leg("B69102", "JFK", "MCO", Z("20:15"), Z("23:05"), "N901SM"),
    leg("B69103", "MCO", "JFK", Z("00:00", 1), Z("02:40", 1), "N901SM"),
    leg("B69104", "JFK", "BUF", Z("03:25", 1), Z("04:50", 1), "N901SM"),
    // A spare aircraft waiting at JFK, used in the swap scenarios.
    leg("B69120", "MCO", "JFK", Z("15:00"), Z("17:40"), "N907SM"),
  ];
}

const find = (s: SimState, f: string) => s.legs.find((l) => l.flightNumber === f)!;
let reportSeq = 0;
function report(s: SimState, type: ReportType, who: string, minutesAgo = 0, value: number | string | null = null) {
  reportSeq += 1;
  const t = new Date(s.now.getTime() - minutesAgo * 60_000);
  s.reports.push({ id: `sim-${reportSeq}`, type, source: "simulation", contributor: `sim-passenger-${who}`, createdAt: t, observedAt: t, moderation: "accepted", value });
}

const MILD = { windKmh: 18, visibilityKm: 16, precipMm: 0, tempC: 9, severe: false, summary: "Clear, light wind." };

/* --------------------------------- scenarios --------------------------------- */

const CASCADE: SimEvent[] = [
  { at: "16:30", label: "Morning check", narration: "3 h to departure. Inbound plane has 55 min to turn.", spotlight: "overview" },
  {
    at: "18:35",
    label: "Incoming leaves late",
    narration: "Inbound leaves 35 min late. Turn shrinks to about 20 min.",
    spotlight: "rotation",
    apply: (s) => {
      const l = find(s, "B69101");
      l.status = "in_air";
      l.actualDeparture = Z("18:35");
      l.estimatedArrival = Z("19:55");
    },
  },
  {
    at: "19:05",
    label: "Holding over JFK",
    narration: "Inbound holds. Now 70 min late. Delay reaches later legs.",
    spotlight: "ripple",
    apply: (s) => {
      find(s, "B69101").estimatedArrival = Z("20:30");
    },
  },
  {
    at: "19:20",
    label: "Passengers report no aircraft",
    narration: "Two passengers: no aircraft at gate. Corroborated.",
    spotlight: "reports",
    apply: (s) => {
      report(s, "incoming_aircraft_not_at_gate", "a", 2);
      report(s, "incoming_aircraft_not_at_gate", "b", 0);
      report(s, "boarding_not_started", "a", 1);
    },
  },
  {
    at: "19:35",
    label: "A conflicting report",
    narration: "One report says boarding started. Reports now contested.",
    spotlight: "reports",
    apply: (s) => {
      report(s, "boarding_started", "c", 0);
    },
  },
  {
    at: "19:50",
    label: "Delay announced",
    narration: "Three passengers: 75 min delay announced. Range narrows.",
    spotlight: "why",
    apply: (s) => {
      report(s, "delay_announced", "a", 1, 75);
      report(s, "delay_announced", "b", 0, 75);
      report(s, "delay_announced", "d", 0, 70);
    },
  },
  {
    at: "20:28",
    label: "Incoming lands",
    narration: "Inbound lands 68 min late. Delay is now observed.",
    spotlight: "rotation",
    apply: (s) => {
      const l = find(s, "B69101");
      l.status = "landed";
      l.actualArrival = Z("20:28");
      l.estimatedArrival = null;
    },
  },
  {
    at: "20:55",
    label: "Boarding",
    narration: "Four passengers: boarding started. Old reports fade.",
    spotlight: "reports",
    apply: (s) => {
      report(s, "boarding_started", "a", 1);
      report(s, "boarding_started", "b", 0);
      report(s, "boarding_started", "e", 0);
      report(s, "incoming_aircraft_at_gate", "e", 3);
    },
  },
  {
    at: "21:25",
    label: "Your flight departs",
    narration: "Departs 70 min late. Model is now confident.",
    spotlight: "overview",
    apply: (s) => {
      const l = find(s, "B69102");
      l.status = "in_air";
      l.actualDeparture = Z("21:25");
      l.estimatedArrival = Z("00:10", 1);
    },
  },
  {
    at: "21:45",
    label: "Aircraft swap downstream",
    narration: "Later leg gets a spare plane. Old link dropped.",
    spotlight: "ripple",
    apply: (s) => {
      const l = find(s, "B69103");
      l.registration = "N907SM";
      const l4 = find(s, "B69104");
      l4.registration = "N907SM";
      s.legs.push(leg("B69130", "MCO", "FLL", Z("01:30", 1), Z("02:35", 1), "N901SM"));
    },
  },
  {
    at: "00:20",
    label: "Arrived",
    narration: "Arrived 70 min late. Recorded outcome.",
    spotlight: "overview",
    apply: (s) => {
      const l = find(s, "B69102");
      l.status = "landed";
      l.actualArrival = Z("00:15", 1);
      l.estimatedArrival = null;
    },
  },
];

const CONFLICT: SimEvent[] = [
  { at: "19:10", label: "No reports yet", narration: "No data yet.", spotlight: "overview", apply: (s) => ((s.targetReg = null), (s.aircraftLookup = "not_configured")) },
  { at: "19:20", label: "One report", narration: "One report. Unverified. No change.", spotlight: "reports", apply: (s) => report(s, "delay_announced", "a", 0, 90) },
  { at: "19:26", label: "Corroborated", narration: "Three matching reports. Forecast updates.", spotlight: "why", apply: (s) => (report(s, "delay_announced", "b", 0, 90), report(s, "delay_announced", "c", 0, 90)) },
  { at: "19:30", label: "Same person again", narration: "Repeat taps count once.", spotlight: "reports", apply: (s) => (report(s, "delay_announced", "a", 0, 90), report(s, "delay_announced", "a", 0, 90)) },
  { at: "19:40", label: "Contradiction", narration: "Reports conflict. Both marked contested.", spotlight: "reports", apply: (s) => (report(s, "boarding_not_started", "a", 0), report(s, "boarding_not_started", "b", 0), report(s, "doors_closed", "d", 0), report(s, "doors_closed", "e", 0)) },
  {
    at: "20:20",
    label: "Official data resolves it",
    narration: "Official data: left gate 20:18. It outranks reports.",
    spotlight: "quality",
    apply: (s) => {
      s.aircraftLookup = "simulated";
      const l = find(s, "B69102");
      l.status = "in_air";
      l.actualDeparture = Z("20:18");
      l.estimatedArrival = Z("23:05");
      s.reports.push({ id: "sim-official", type: "departed", source: "provider", contributor: "official:schedule", createdAt: Z("20:18"), observedAt: Z("20:18"), moderation: "accepted" });
    },
  },
];

const SWAP: SimEvent[] = [
  {
    at: "19:05",
    label: "Late aircraft",
    narration: "Your plane is 70 min late. Knock-on delay likely.",
    spotlight: "rotation",
    apply: (s) => {
      const l = find(s, "B69101");
      l.status = "in_air";
      l.actualDeparture = Z("18:35");
      l.estimatedArrival = Z("20:30");
    },
  },
  {
    at: "19:15",
    label: "Swap announced",
    narration: "Spare plane assigned. Delay no longer counts.",
    spotlight: "why",
    apply: (s) => {
      s.prevReg = s.targetReg;
      s.targetReg = "N907SM";
      const spare = find(s, "B69120");
      spare.status = "landed";
      spare.actualArrival = Z("17:36");
      find(s, "B69102").registration = "N907SM";
      find(s, "B69103").registration = "N907SM";
      find(s, "B69104").registration = "N907SM";
    },
  },
  {
    at: "19:40",
    label: "Aircraft at the gate",
    narration: "Plane at gate. Risk drops.",
    spotlight: "reports",
    apply: (s) => (report(s, "incoming_aircraft_at_gate", "a", 0), report(s, "incoming_aircraft_at_gate", "b", 0)),
  },
  {
    at: "19:50",
    label: "Assignment unclear",
    narration: "Plane unknown. Rotation hidden.",
    spotlight: "rotation",
    apply: (s) => {
      find(s, "B69102").registration = null;
      s.prevReg = "N907SM";
      s.targetReg = "N907SM";
      s.legs = s.legs.filter((l) => !(l.flightNumber === "B69102"));
    },
  },
];

const STALE: SimEvent[] = [
  { at: "18:00", label: "All sources up", narration: "All data fresh.", spotlight: "quality", apply: (s) => ((s.providerUpdatedAt = Z("17:58")), (find(s, "B69101").estimatedArrival = Z("19:30"))) },
  {
    at: "18:50",
    label: "Provider outage",
    narration: "Schedule data down. Showing last good data.",
    spotlight: "quality",
    apply: (s) => {
      s.providerErrors = ["Schedule provider: HTTP 503 (simulated outage)"];
      s.providerUpdatedAt = Z("18:00");
    },
  },
  {
    at: "19:30",
    label: "Aircraft data missing",
    narration: "Aircraft data down. Rotation hidden.",
    spotlight: "rotation",
    apply: (s) => {
      s.aircraftLookup = "error";
      s.targetReg = null;
      s.weather = null;
    },
  },
  {
    at: "19:45",
    label: "Back online",
    narration: "Data back. Confidence recovers.",
    spotlight: "overview",
    apply: (s) => {
      s.providerErrors = [];
      s.aircraftLookup = "simulated";
      s.targetReg = "N901SM";
      s.weather = { ...MILD };
      s.providerUpdatedAt = Z("19:45");
      find(s, "B69101").estimatedArrival = Z("19:40");
    },
  },
];

export const SCENARIOS: Array<ScenarioMeta & { events: SimEvent[] }> = [
  {
    id: "cascade",
    title: "Cascade",
    summary: "A late plane delays later flights.",
    expected: "",
    focusFlight: "B69102",
    events: CASCADE,
  },
  {
    id: "reports",
    title: "Reports",
    summary: "Passenger reports vs official data.",
    expected: "",
    focusFlight: "B69102",
    events: CONFLICT,
  },
  {
    id: "swap",
    title: "Swap",
    summary: "A spare plane replaces yours.",
    expected: "",
    focusFlight: "B69102",
    events: SWAP,
  },
  {
    id: "stale",
    title: "Stale data",
    summary: "Data goes down, then returns.",
    expected: "",
    focusFlight: "B69102",
    events: STALE,
  },
];

function initialState(): SimState {
  reportSeq = 0;
  return {
    now: Z("16:30"),
    legs: baseLegs(),
    targetReg: "N901SM",
    prevReg: null,
    reports: [],
    providerErrors: [],
    scheduleConfigured: true,
    aircraftLookup: "simulated",
    providerUpdatedAt: null,
    weather: { ...MILD },
  };
}

function eventTime(at: string, prev: Date | null) {
  let t = Z(at);
  // Events are listed in order; a clock time earlier than the previous one is the next day.
  while (prev && t.getTime() < prev.getTime()) t = new Date(t.getTime() + 86_400_000);
  return t;
}

/** Computes every frame of a scenario. Deterministic: same scenario, same frames. */
export function buildFrames(id: string, predictor: Predictor | null): { meta: ScenarioMeta; frames: SimFrame[]; airports: Record<string, { tz: string; city: string | null; name: string }> } | null {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) return null;
  const s = initialState();
  const frames: SimFrame[] = [];
  let prevResult: RippleResult | null = null;
  let prevAt: Date | null = null;
  sc.events.forEach((ev, index) => {
    s.now = eventTime(ev.at, prevAt);
    prevAt = s.now;
    if (!s.providerErrors.length) s.providerUpdatedAt = s.providerUpdatedAt && s.providerUpdatedAt > s.now ? s.providerUpdatedAt : s.now;
    ev.apply?.(s);
    const result = frameResult(s, predictor);
    frames.push({ index, at: s.now.toISOString(), label: ev.label, narration: ev.narration, spotlight: ev.spotlight, result, changes: diffResults(prevResult, result) });
    prevResult = result;
  });
  return {
    meta: { id: sc.id, title: sc.title, summary: sc.summary, expected: sc.expected, focusFlight: sc.focusFlight },
    frames,
    airports: Object.fromEntries(Object.values(AIRPORTS).map((a) => [a.iata, { tz: a.tz, city: a.city, name: a.name }])),
  };
}

function frameResult(s: SimState, predictor: Predictor | null): RippleResult {
  const t = s.legs.find((l) => l.flightNumber === TARGET.flightNumber) ?? { ...leg(TARGET.flightNumber, "JFK", "MCO", TARGET.dep, TARGET.arr, "") };
  const flight: EngineFlight = {
    key: `${TARGET.flightNumber}:${DAY}:${TARGET.origin}`,
    flightNumber: TARGET.flightNumber,
    carrier: "B6",
    origin: AIRPORTS.JFK,
    destination: AIRPORTS.MCO,
    scheduledDeparture: TARGET.dep,
    scheduledArrival: TARGET.arr,
    status: t.status,
    estimatedArrival: t.estimatedArrival ?? null,
    estimatedArrivalSource: t.estimatedArrival ? "Simulated flight data" : null,
    actualDeparture: t.actualDeparture ?? null,
    actualDepartureSource: t.actualDeparture ? "Simulated flight data, gate departure" : null,
    actualArrival: t.actualArrival ?? null,
    actualArrivalSource: t.actualArrival ? "Simulated flight data, gate arrival" : null,
    providerUpdatedAt: s.providerUpdatedAt,
  };
  const visibleLegs = s.aircraftLookup === "error" || s.aircraftLookup === "not_configured" ? [] : s.legs.map((l) => ({ ...l, observedAt: s.providerUpdatedAt ?? s.now }));
  const rotation =
    s.aircraftLookup === "error"
      ? resolveRotation({ flightNumber: TARGET.flightNumber, origin: TARGET.origin, destination: TARGET.destination, scheduledDeparture: TARGET.dep, scheduledArrival: TARGET.arr }, null, [], { now: s.now })
      : resolveRotation(
          { flightNumber: TARGET.flightNumber, origin: TARGET.origin, destination: TARGET.destination, scheduledDeparture: TARGET.dep, scheduledArrival: TARGET.arr },
          s.targetReg,
          visibleLegs,
          { now: s.now, previousRegistration: s.prevReg },
        );
  if (s.aircraftLookup === "error") rotation.reasons = ["The aircraft lookup failed (simulated outage), so the incoming flight is unknown."];
  const reports = aggregateReports(s.reports, s.now);
  let model: ModelPrediction | null = null;
  if (predictor && !flight.actualArrival) {
    const stage: Stage = flight.actualDeparture ? "enroute" : "predeparture";
    model = predictor(stage, {
      carrier: "B6",
      flightNumber: TARGET.flightNumber,
      origin: "JFK",
      destination: "MCO",
      originTz: AIRPORTS.JFK.tz,
      destinationTz: AIRPORTS.MCO.tz,
      scheduledDeparture: TARGET.dep,
      scheduledArrival: TARGET.arr,
      distanceKm: DIST["JFK|MCO"],
      departureDelayMin: flight.actualDeparture ? Math.round((flight.actualDeparture.getTime() - TARGET.dep.getTime()) / 60_000) : null,
      weather: s.weather ? { windKmh: s.weather.windKmh, visibilityKm: s.weather.visibilityKm, precipMm: s.weather.precipMm, tempC: s.weather.tempC } : null,
    });
  }
  return computeRipple({
    flight,
    rotation,
    reports,
    weather: s.weather ? { severe: s.weather.severe, summary: s.weather.summary, fetchedAt: s.now.toISOString(), source: "Simulated weather" } : null,
    model,
    provider: { scheduleConfigured: s.scheduleConfigured, aircraftLookup: s.aircraftLookup, errors: s.providerErrors },
    now: s.now,
    mode: "simulation",
  });
}
