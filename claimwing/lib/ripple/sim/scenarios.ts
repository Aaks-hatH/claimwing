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

const MILD = { windKmh: 18, visibilityKm: 16, precipMm: 0, tempC: 9, severe: false, summary: "Partly cloudy at JFK, light wind, good visibility (simulated)." };

/* --------------------------------- scenarios --------------------------------- */

const CASCADE: SimEvent[] = [
  { at: "16:30", label: "Morning check", narration: "Three hours before departure. The aircraft for your flight, N901SM, is due in from Boston with 55 minutes to turn around. The trained model gives a base risk from route history and weather.", spotlight: "overview" },
  {
    at: "18:35",
    label: "Incoming leaves late",
    narration: "The incoming flight from Boston pushes back 35 minutes late. Its new arrival estimate cuts the turnaround at JFK to about 20 minutes, less than an A320 normally needs.",
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
    narration: "Air traffic control puts the incoming flight into a hold. Its estimate slips to 70 minutes late. The knock-on delay now passes through your flight to the aircraft's later legs to Orlando and back.",
    spotlight: "ripple",
    apply: (s) => {
      find(s, "B69101").estimatedArrival = Z("20:30");
    },
  },
  {
    at: "19:20",
    label: "Passengers report no aircraft",
    narration: "Two people at gate B24 independently report that there's no aircraft at the gate yet. Two independent, recent reports count as corroborated.",
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
    narration: "One passenger reports boarding has started, contradicting two others. ClaimWing doesn't pick a side: the reports are marked contested and count for less.",
    spotlight: "reports",
    apply: (s) => {
      report(s, "boarding_started", "c", 0);
    },
  },
  {
    at: "19:50",
    label: "Delay announced",
    narration: "Three passengers report a gate announcement of a 75-minute delay. Corroborated reports now narrow the forecast range.",
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
    narration: "The Boston flight reaches the gate 68 minutes late. The aircraft's lateness is now observed, not estimated. It agrees with the announced delay, so the forecast holds.",
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
    narration: "Four passengers report boarding has started. The older 'not started' reports have faded with time.",
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
    narration: "Your flight pushes back 70 minutes late. This is an en-route update now: the model knows the real departure delay and becomes much more confident.",
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
    narration: "The airline moves the Orlando to New York leg to a spare aircraft. N901SM's later legs change, so ClaimWing drops the old link instead of assuming it still holds. B69103 is no longer at risk from your delay.",
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
    narration: "Your flight reaches the gate in Orlando 70 minutes late. This is the recorded outcome. Under US rules a delay gives no cash compensation, which ClaimWing checks separately, never from the forecast.",
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
  { at: "19:10", label: "No reports yet", narration: "No aircraft data in this scenario, so only passenger reports can move the forecast. With nothing reported, there isn't enough data.", spotlight: "overview", apply: (s) => ((s.targetReg = null), (s.aircraftLookup = "not_configured")) },
  { at: "19:20", label: "One report", narration: "A single passenger says a 90-minute delay was announced. One report is shown as unverified and does not change the forecast.", spotlight: "reports", apply: (s) => report(s, "delay_announced", "a", 0, 90) },
  { at: "19:26", label: "Corroborated", narration: "Two more people report the same announcement. Independent, recent and matching: the forecast now uses it.", spotlight: "why", apply: (s) => (report(s, "delay_announced", "b", 0, 90), report(s, "delay_announced", "c", 0, 90)) },
  { at: "19:30", label: "Same person again", narration: "Passenger A taps the same report three more times. Repeats from one person count once, so nothing changes.", spotlight: "reports", apply: (s) => (report(s, "delay_announced", "a", 0, 90), report(s, "delay_announced", "a", 0, 90)) },
  { at: "19:40", label: "Contradiction", narration: "Two others report doors closed, which can't be true at the same time as 'boarding not started'. Both claims are marked contested and weigh less.", spotlight: "reports", apply: (s) => (report(s, "boarding_not_started", "a", 0), report(s, "boarding_not_started", "b", 0), report(s, "doors_closed", "d", 0), report(s, "doors_closed", "e", 0)) },
  {
    at: "20:20",
    label: "Official data resolves it",
    narration: "Flight data confirms the aircraft left the gate at 20:18. Official observations outrank passenger reports, and the forecast becomes an en-route update.",
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
    narration: "Your aircraft, N901SM, is held over JFK and expected 70 minutes late. With 55 minutes scheduled on the ground, a knock-on delay looks likely.",
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
    narration: "The airline swaps your flight onto N907SM, a spare aircraft already parked at JFK. The late Boston flight is no longer linked to yours, so its delay stops counting against you.",
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
    narration: "Passengers confirm an aircraft is at the gate. Risk falls back toward the base level from history and weather.",
    spotlight: "reports",
    apply: (s) => (report(s, "incoming_aircraft_at_gate", "a", 0), report(s, "incoming_aircraft_at_gate", "b", 0)),
  },
  {
    at: "19:50",
    label: "Assignment unclear",
    narration: "The provider's latest data doesn't list your flight on any aircraft. ClaimWing shows the rotation as unknown instead of keeping an assumption it can't support.",
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
  { at: "18:00", label: "All sources up", narration: "Schedule data, aircraft data and weather are all fresh.", spotlight: "quality", apply: (s) => ((s.providerUpdatedAt = Z("17:58")), (find(s, "B69101").estimatedArrival = Z("19:30"))) },
  {
    at: "18:50",
    label: "Provider outage",
    narration: "The schedule provider stops answering. ClaimWing keeps the last good data, says how old it is, and lowers its confidence instead of treating old estimates as current.",
    spotlight: "quality",
    apply: (s) => {
      s.providerErrors = ["Schedule provider: HTTP 503 (simulated outage)"];
      s.providerUpdatedAt = Z("18:00");
    },
  },
  {
    at: "19:30",
    label: "Aircraft data missing",
    narration: "The aircraft lookup also fails. The rotation becomes unknown, and the ripple chain disappears rather than showing links that can't be checked.",
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
    narration: "Data returns. Freshness timestamps update and confidence recovers.",
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
    title: "Flight Ripple cascade",
    summary: "An incoming flight is delayed, the turnaround shrinks, and the delay ripples through three legs flown by the same aircraft.",
    expected: "Risk rises step by step as the incoming flight slips, passenger reports corroborate and conflict, and a downstream swap removes a link.",
    focusFlight: "B69102",
    events: CASCADE,
  },
  {
    id: "reports",
    title: "Conflicting passenger reports",
    summary: "Passenger observations arrive one by one: unverified, corroborated, repeated, contradicted, then settled by official data.",
    expected: "Only independent, recent, consistent reports move the forecast. Duplicates count once; contradictions are marked contested.",
    focusFlight: "B69102",
    events: CONFLICT,
  },
  {
    id: "swap",
    title: "Aircraft swap",
    summary: "Your late aircraft is replaced by a spare, then the assignment disappears from the data.",
    expected: "Risk drops after the swap, and the rotation becomes unknown when the data no longer supports it.",
    focusFlight: "B69102",
    events: SWAP,
  },
  {
    id: "stale",
    title: "Missing or stale data",
    summary: "The schedule provider and aircraft lookup go down, then recover.",
    expected: "ClaimWing labels old data, lowers confidence and removes unsupported links instead of inventing information.",
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
