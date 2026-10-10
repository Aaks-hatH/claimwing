import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateReports, detectBurst, recencyWeight, sanitizeNote, validateReport, type ReportInput } from "@/lib/ripple/reports";
import { resolveRotation, type AircraftLeg, type TargetFlight } from "@/lib/ripple/rotation";
import { departureToArrival, estimateTurnaround, propagateOnce, riskForThreshold } from "@/lib/ripple/propagation";
import { interp, rawScore, sigmoid, type ExportedModel } from "@/lib/ripple/gbdt";
import { artifactSchema, buildFeatures, predictWithArtifact, type ModelArtifact, type ModelFlightInput } from "@/lib/ripple/model-core";
import { computeRipple, diffResults, type EngineInput } from "@/lib/ripple/engine";
import { datedFlightKey, parseFlightKey } from "@/lib/ripple/flight-id";
import { parseAeroDataBoxLegs } from "@/lib/ripple/aircraft-provider";

const NOW = new Date("2026-10-10T12:00:00Z");
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);

function rep(over: Partial<ReportInput>): ReportInput {
  return { id: Math.random().toString(36), type: "boarding_started", source: "passenger", contributor: "a", createdAt: min(-5), moderation: "accepted", ...over };
}

/* ------------------------------ dated flights ------------------------------ */
describe("dated flight keys", () => {
  it("builds and parses a dated instance, distinct from the bare flight number", () => {
    const k = datedFlightKey("ba 117", "2026-10-10", "lhr");
    expect(k).toBe("BA117:2026-10-10:LHR");
    expect(parseFlightKey(k)).toEqual({ flightNumber: "BA117", date: "2026-10-10", origin: "LHR" });
    expect(datedFlightKey("BA117", "2026-10-11", "LHR")).not.toBe(k);
  });
  it("rejects impossible dates and malformed keys", () => {
    expect(parseFlightKey("BA117:2026-02-30:LHR")).toBeNull();
    expect(parseFlightKey("BA117:2026-10-10")).toBeNull();
    expect(() => datedFlightKey("BA117", "10/10/2026", "LHR")).toThrow();
  });
});

/* ------------------------------ passenger network ------------------------------ */
describe("report aggregation", () => {
  it("decays with age using a half-life per observation type", () => {
    expect(recencyWeight("boarding_started", 0)).toBe(1);
    expect(recencyWeight("boarding_started", 25)).toBeCloseTo(0.5, 5);
    expect(recencyWeight("boarding_started", 50)).toBeCloseTo(0.25, 5);
    const fresh = aggregateReports([rep({ contributor: "a", createdAt: min(-1) }), rep({ contributor: "b", createdAt: min(-1) })], NOW).claims[0];
    const old = aggregateReports([rep({ contributor: "a", createdAt: min(-60) }), rep({ contributor: "b", createdAt: min(-60) })], NOW).claims[0];
    expect(fresh.signal).toBeGreaterThan(old.signal);
  });

  it("counts independent people, not repeated reports from one person", () => {
    const sameUser = aggregateReports([rep({ contributor: "a" }), rep({ contributor: "a", createdAt: min(-3) }), rep({ contributor: "a", createdAt: min(-2) })], NOW).claims[0];
    const twoUsers = aggregateReports([rep({ contributor: "a" }), rep({ contributor: "b" })], NOW).claims[0];
    expect(sameUser.contributors).toBe(1);
    expect(sameUser.level).toBe("unverified");
    expect(twoUsers.contributors).toBe(2);
    expect(twoUsers.support).toBeGreaterThan(sameUser.support);
    expect(["some", "strong"]).toContain(twoUsers.level);
  });

  it("marks conflicting reports as contested and lowers their signal", () => {
    const agree = aggregateReports([rep({ type: "boarding_not_started", contributor: "a" }), rep({ type: "boarding_not_started", contributor: "b" })], NOW);
    const disagree = aggregateReports(
      [rep({ type: "boarding_not_started", contributor: "a" }), rep({ type: "boarding_not_started", contributor: "b" }), rep({ type: "doors_closed", contributor: "c" }), rep({ type: "doors_closed", contributor: "d" })],
      NOW,
    );
    const a = agree.claims.find((c) => c.type === "boarding_not_started")!;
    const d = disagree.claims.find((c) => c.type === "boarding_not_started")!;
    expect(d.signal).toBeLessThan(a.signal);
    expect(d.level).toBe("contested");
    expect(d.conflictsWith).toContain("doors_closed");
    expect(disagree.notes.join(" ")).toMatch(/disagree/);
  });

  it("checks passenger reports against official observations", () => {
    const r = aggregateReports([rep({ type: "boarding_not_started", contributor: "a" }), rep({ type: "departed", source: "provider", contributor: "official:x", createdAt: min(-3) })], NOW);
    expect(r.claims.find((c) => c.type === "boarding_not_started")!.level).toBe("contested");
    expect(r.claims.find((c) => c.type === "departed")!.source).toBe("official");
  });

  it("gives flagged reports less weight and ignores rejected ones", () => {
    const ok = aggregateReports([rep({ contributor: "a" })], NOW).claims[0].support;
    const flagged = aggregateReports([rep({ contributor: "a", moderation: "flagged" })], NOW).claims[0].support;
    expect(flagged).toBeLessThan(ok);
    const rejected = aggregateReports([rep({ contributor: "a", moderation: "rejected" })], NOW);
    expect(rejected.claims).toHaveLength(0);
    expect(rejected.notes[0]).toMatch(/set aside/);
  });

  it("does not present a single report as corroborated", () => {
    const r = aggregateReports([rep({ type: "cancellation_announced", contributor: "a" })], NOW).claims[0];
    expect(r.level).toBe("unverified");
    expect(r.contributorsLabel).toBe("1 report");
  });

  it("detects bursts of reports", () => {
    const many = Array.from({ length: 14 }, (_, i) => rep({ contributor: `c${i}`, createdAt: new Date(NOW.getTime() - i * 5000) }));
    expect(detectBurst(many)).toMatch(/burst/);
    expect(detectBurst(many.slice(0, 5))).toBeNull();
  });
});

describe("report validation", () => {
  const ctx = { now: NOW, scheduledDeparture: min(60), scheduledArrival: min(240) };
  it("accepts a normal report and validates structured values", () => {
    expect(validateReport({ type: "gate_changed", value: "b32" }, ctx)).toMatchObject({ ok: true, value: "B32" });
    expect(validateReport({ type: "delay_announced", value: 45 }, ctx)).toMatchObject({ ok: true, value: 45 });
    expect(validateReport({ type: "delay_announced", value: 2 }, ctx)).toMatchObject({ ok: false, code: "invalid_value" });
    expect(validateReport({ type: "boarding_started", value: 5 }, ctx)).toMatchObject({ ok: false });
  });
  it("rejects implausible times", () => {
    expect(validateReport({ type: "boarding_started", observedAt: min(10).toISOString() }, ctx)).toMatchObject({ ok: false, code: "invalid_time" });
    expect(validateReport({ type: "boarding_started", observedAt: min(-300).toISOString() }, ctx)).toMatchObject({ ok: false, code: "invalid_time" });
    expect(validateReport({ type: "boarding_started", observedAt: "not a date" }, ctx)).toMatchObject({ ok: false });
  });
  it("only accepts reports in the flight's window", () => {
    expect(validateReport({ type: "boarding_started" }, { now: NOW, scheduledDeparture: min(60 * 24), scheduledArrival: min(60 * 26) })).toMatchObject({ ok: false, code: "outside_window" });
  });
  it("strips contact details and booking references from notes", () => {
    const n = sanitizeNote("Call me on +44 7700 900123 or a@b.com, booking ABC12D <script>")!;
    expect(n).not.toMatch(/7700|a@b\.com|ABC12D|<script>/);
    expect(sanitizeNote("x".repeat(500))!.length).toBe(140);
  });
});

/* ------------------------------ aircraft rotation ------------------------------ */
function leg(over: Partial<AircraftLeg>): AircraftLeg {
  return {
    flightNumber: "BA100",
    date: "2026-10-10",
    origin: "LHR",
    destination: "MAD",
    scheduledDeparture: new Date("2026-10-10T08:00:00Z"),
    scheduledArrival: new Date("2026-10-10T10:20:00Z"),
    status: "scheduled",
    registration: "G-EUYA",
    source: "test",
    observedAt: NOW,
    ...over,
  };
}
const TARGET: TargetFlight = { flightNumber: "BA101", origin: "MAD", destination: "LHR", scheduledDeparture: new Date("2026-10-10T11:15:00Z"), scheduledArrival: new Date("2026-10-10T13:35:00Z") };
const ROT = [
  leg({}),
  leg({ flightNumber: "BA101", origin: "MAD", destination: "LHR", scheduledDeparture: TARGET.scheduledDeparture, scheduledArrival: TARGET.scheduledArrival }),
  leg({ flightNumber: "BA402", origin: "LHR", destination: "BRU", scheduledDeparture: new Date("2026-10-10T14:30:00Z"), scheduledArrival: new Date("2026-10-10T15:40:00Z") }),
  leg({ flightNumber: "BA403", origin: "BRU", destination: "LHR", scheduledDeparture: new Date("2026-10-10T16:30:00Z"), scheduledArrival: new Date("2026-10-10T17:40:00Z") }),
];

describe("rotation resolution", () => {
  it("links incoming, target and following legs flown by the same registration", () => {
    const r = resolveRotation(TARGET, "G-EUYA", ROT, { now: new Date("2026-10-10T09:00:00Z") });
    expect(r.confidence).toBe("confirmed");
    expect(r.incoming?.flightNumber).toBe("BA100");
    expect(r.subsequent.map((l) => l.flightNumber)).toEqual(["BA402", "BA403"]);
    expect(r.links[0].scheduledGroundMin).toBe(55);
  });

  it("reports unknown when no aircraft is assigned, even for a mirror-image route", () => {
    const r = resolveRotation(TARGET, null, ROT, { now: NOW });
    expect(r.confidence).toBe("unknown");
    expect(r.incoming).toBeNull();
  });

  it("never links legs flown by a different aircraft", () => {
    const mixed = [leg({ registration: "G-OTHER" }), ...ROT.slice(1)];
    const r = resolveRotation(TARGET, "G-EUYA", mixed, { now: NOW });
    expect(r.incoming).toBeNull();
  });

  it("does not match the same flight number on another day", () => {
    const tomorrow = { ...TARGET, scheduledDeparture: new Date("2026-10-11T11:15:00Z"), scheduledArrival: new Date("2026-10-11T13:35:00Z") };
    const r = resolveRotation(tomorrow, "G-EUYA", ROT, { now: NOW });
    expect(r.confidence).toBe("unknown");
    expect(r.reasons[0]).toMatch(/not listed on this flight/);
  });

  it("stops the chain when airports don't connect or ground time is implausible", () => {
    const broken = [leg({ destination: "BCN" }), ...ROT.slice(1)];
    expect(resolveRotation(TARGET, "G-EUYA", broken, { now: NOW }).incoming).toBeNull();
    const longGap = [leg({ scheduledArrival: new Date("2026-10-09T20:00:00Z"), scheduledDeparture: new Date("2026-10-09T18:00:00Z") }), ...ROT.slice(1)];
    expect(resolveRotation(TARGET, "G-EUYA", longGap, { now: NOW }).incoming).toBeNull();
    const tooShort = [leg({ scheduledArrival: new Date("2026-10-10T11:05:00Z") }), ...ROT.slice(1)];
    expect(resolveRotation(TARGET, "G-EUYA", tooShort, { now: NOW }).incoming).toBeNull();
  });

  it("handles rotations across midnight and time zones using UTC instants", () => {
    // JFK 23:30 local (03:30Z next day) to LHR; next leg LHR to DUB the next local morning.
    const t: TargetFlight = { flightNumber: "BA178", origin: "JFK", destination: "LHR", scheduledDeparture: new Date("2026-10-11T03:30:00Z"), scheduledArrival: new Date("2026-10-11T10:30:00Z") };
    const legs = [
      leg({ flightNumber: "BA177", origin: "LHR", destination: "JFK", date: "2026-10-10", scheduledDeparture: new Date("2026-10-10T19:00:00Z"), scheduledArrival: new Date("2026-10-11T01:50:00Z") }),
      leg({ flightNumber: "BA178", origin: "JFK", destination: "LHR", date: "2026-10-10", scheduledDeparture: t.scheduledDeparture, scheduledArrival: t.scheduledArrival }),
      leg({ flightNumber: "BA830", origin: "LHR", destination: "DUB", date: "2026-10-11", scheduledDeparture: new Date("2026-10-11T12:10:00Z"), scheduledArrival: new Date("2026-10-11T13:30:00Z") }),
    ];
    const r = resolveRotation(t, "G-EUYA", legs, { now: new Date("2026-10-11T00:00:00Z") });
    expect(r.incoming?.flightNumber).toBe("BA177");
    expect(r.links[0].scheduledGroundMin).toBe(100);
    expect(r.subsequent[0].flightNumber).toBe("BA830");
  });

  it("detects an aircraft swap and labels long-range assignments as planned", () => {
    const r = resolveRotation(TARGET, "G-EUYA", ROT, { now: new Date("2026-10-09T20:00:00Z"), previousRegistration: "G-EUYB" });
    expect(r.swap).toEqual({ previous: "G-EUYB", current: "G-EUYA" });
    expect(r.confidence).toBe("planned");
    expect(r.reasons.join(" ")).toMatch(/changed from G-EUYB/);
  });

  it("parses AeroDataBox aircraft legs defensively", () => {
    const legs = parseAeroDataBoxLegs(
      [
        { number: "BA 101", status: "Expected", departure: { airport: { iata: "MAD" }, scheduledTime: { utc: "2026-10-10 11:15Z" } }, arrival: { airport: { iata: "LHR" }, scheduledTime: { utc: "2026-10-10 13:35Z" }, revisedTime: { utc: "2026-10-10 14:05Z" } }, aircraft: { reg: "g-euya", model: "Airbus A320" } },
        { number: "BA 999", departure: { airport: {} }, arrival: {} },
      ],
      "G-EUYA",
      NOW,
    );
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ flightNumber: "BA101", registration: "G-EUYA", status: "scheduled" });
    expect(legs[0].estimatedArrival?.toISOString()).toBe("2026-10-10T14:05:00.000Z");
  });
});

/* ------------------------------ turnaround and propagation ------------------------------ */
describe("turnaround and propagation", () => {
  it("uses ranges by aircraft size, never one fixed number", () => {
    const wide = estimateTurnaround({ aircraftModel: "Boeing 777-300ER", carrier: "BA" });
    const narrow = estimateTurnaround({ aircraftModel: "Airbus A320", carrier: "BA" });
    const lcc = estimateTurnaround({ aircraftModel: "Boeing 737-800", carrier: "FR" });
    const unknown = estimateTurnaround({});
    expect(wide.low).toBeGreaterThan(narrow.low);
    expect(lcc.mid).toBeLessThan(narrow.mid);
    expect(unknown.high - unknown.low).toBeGreaterThan(narrow.high - narrow.low);
    const measured = estimateTurnaround({ carrier: "BA", airport: "MAD", aircraftModel: "A320" }, { "BA|MAD": 50 });
    expect(measured.measured).toBe(true);
    expect(measured.mid).toBe(50);
  });

  it("applies predicted_inbound_arrival and remaining_turnaround as specified", () => {
    const turn = { low: 30, mid: 40, high: 55, basis: "t", measured: false };
    // 55 min scheduled ground, inbound 60 min late: remaining = -5 min, knock-on = 40 - (-5) = 45.
    const s = propagateOnce(55, { low: 60, mid: 60, high: 60, kind: "observed", basis: "x" }, turn);
    expect(s.remainingTurnaroundMin.mid).toBe(-5);
    expect(s.knockOnDepartureDelay).toEqual({ low: 35, mid: 45, high: 60 });
    expect(s.outcome).toBe("propagates");
    expect(s.explanation).toMatch(/incoming aircraft is expected to arrive late/);
  });

  it("absorbs small delays and flags tight turns", () => {
    const turn = { low: 30, mid: 40, high: 55, basis: "t", measured: false };
    expect(propagateOnce(120, { low: 5, mid: 10, high: 15, kind: "estimated", basis: "" }, turn).outcome).toBe("absorbed");
    expect(propagateOnce(60, { low: 0, mid: 10, high: 20, kind: "estimated", basis: "" }, turn).outcome).toBe("tight");
  });

  it("maps a range to a risk level per threshold", () => {
    expect(riskForThreshold({ low: 70, mid: 90, high: 120 }, 60)).toBe("likely");
    expect(riskForThreshold({ low: 10, mid: 40, high: 70 }, 60)).toBe("possible");
    expect(riskForThreshold({ low: 0, mid: 5, high: 10 }, 15)).toBe("unlikely");
    expect(riskForThreshold(null, 15)).toBe("insufficient");
    expect(departureToArrival({ low: 50, mid: 50, high: 50 }, 120).high).toBe(50);
  });
});

/* ------------------------------ trained model ------------------------------ */
const artifactPath = path.join(process.cwd(), "data", "models", "ripple-model.json");
const artifact = artifactSchema.parse(JSON.parse(readFileSync(artifactPath, "utf8"))) as ModelArtifact;

describe("gradient-boosted tree inference", () => {
  it("reproduces the Python reference scores exactly (parity vectors)", () => {
    expect(artifact.model_a.parity.length).toBeGreaterThan(20);
    for (const p of artifact.model_a.parity) {
      const m = artifact.model_a.models.classifiers[p.stage][String(p.threshold)];
      const rs = rawScore(m.model as ExportedModel, p.x);
      expect(rs).toBeCloseTo(p.raw_score, 9);
      const prob = m.calibration ? interp(sigmoid(rs), m.calibration) : sigmoid(rs);
      expect(prob).toBeCloseTo(p.p_calibrated, 9);
    }
  });

  it("interpolates calibration like numpy.interp, clipped at the ends", () => {
    const cal = { x: [0.1, 0.5, 0.9], y: [0.05, 0.4, 0.8] };
    expect(interp(0, cal)).toBe(0.05);
    expect(interp(1, cal)).toBe(0.8);
    expect(interp(0.3, cal)).toBeCloseTo(0.225, 10);
  });
});

const JFK_MCO: ModelFlightInput = {
  carrier: "B6",
  flightNumber: "B6123",
  origin: "JFK",
  destination: "MCO",
  originTz: "America/New_York",
  destinationTz: "America/New_York",
  scheduledDeparture: new Date("2026-10-10T22:30:00Z"),
  scheduledArrival: new Date("2026-10-11T01:15:00Z"),
  distanceKm: 1520,
  weather: { windKmh: 20, visibilityKm: 16, precipMm: 0, tempC: 15 },
};

describe("model inference", () => {
  it("returns calibrated, monotonic probabilities for a covered flight", () => {
    const p = predictWithArtifact(artifact, "predeparture", JFK_MCO);
    expect(p.available).toBe(true);
    if (!p.available) return;
    expect(p.probabilities["15"]).toBeGreaterThanOrEqual(p.probabilities["60"]);
    expect(p.probabilities["60"]).toBeGreaterThanOrEqual(p.probabilities["180"]);
    for (const v of Object.values(p.probabilities)) expect(v).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(p.expectedDelayMin)).toBe(true);
  });

  it("refuses flights outside its coverage instead of guessing", () => {
    const p = predictWithArtifact(artifact, "predeparture", { ...JFK_MCO, origin: "LHR", originTz: "Europe/London" });
    expect(p).toMatchObject({ available: false });
    if (!p.available) expect(p.reason).toMatch(/only covers departures from/);
    expect(predictWithArtifact(artifact, "predeparture", { ...JFK_MCO, carrier: "ZZ" })).toMatchObject({ available: false });
  });

  it("needs the actual departure delay for en-route predictions", () => {
    expect(predictWithArtifact(artifact, "enroute", JFK_MCO)).toMatchObject({ available: false });
    const late = predictWithArtifact(artifact, "enroute", { ...JFK_MCO, departureDelayMin: 120 });
    const early = predictWithArtifact(artifact, "enroute", { ...JFK_MCO, departureDelayMin: -5 });
    if (!late.available || !early.available) throw new Error("expected predictions");
    expect(late.probabilities["60"]).toBeGreaterThan(early.probabilities["60"]);
  });

  it("lists missing inputs instead of treating them as normal", () => {
    const p = predictWithArtifact(artifact, "predeparture", { ...JFK_MCO, weather: null, destination: "XYZ" });
    if (!p.available) throw new Error("expected prediction");
    expect(p.missingInputs).toEqual(expect.arrayContaining(["weather at the departure airport", "history for this route"]));
  });

  it("computes local-time features in the airport's zone (midnight and DST safe)", () => {
    const { x } = buildFeatures(artifact, "predeparture", JFK_MCO);
    const names = artifact.features.predeparture;
    // 22:30Z on 10 Oct is 18:30 New York time (EDT, UTC-4), a Saturday (Monday = 0).
    expect(x[names.indexOf("dep_hour")]).toBeCloseTo(18.5, 5);
    expect(x[names.indexOf("dow")]).toBe(5);
    // 01:15Z on 11 Oct is 21:15 on 10 Oct in New York.
    expect(x[names.indexOf("arr_hour")]).toBeCloseTo(21.25, 5);
    expect(x[names.indexOf("sched_block_min")]).toBe(165);
  });
});

/* ------------------------------ engine ------------------------------ */
function engineInput(over: Partial<EngineInput> = {}): EngineInput {
  return {
    flight: {
      key: "BA101:2026-10-10:MAD",
      flightNumber: "BA101",
      carrier: "BA",
      origin: { iata: "MAD", name: "Madrid", city: "Madrid", tz: "Europe/Madrid" },
      destination: { iata: "LHR", name: "Heathrow", city: "London", tz: "Europe/London" },
      scheduledDeparture: TARGET.scheduledDeparture,
      scheduledArrival: TARGET.scheduledArrival,
      status: "scheduled",
    },
    rotation: resolveRotation(TARGET, "G-EUYA", ROT, { now: new Date("2026-10-10T09:00:00Z") }),
    reports: aggregateReports([], new Date("2026-10-10T09:00:00Z")),
    weather: null,
    model: null,
    provider: { scheduleConfigured: true, aircraftLookup: "available", errors: [] },
    now: new Date("2026-10-10T09:00:00Z"),
    mode: "live",
    ...over,
  };
}

describe("Flight Ripple engine", () => {
  it("returns insufficient data and no probabilities when nothing is known", () => {
    const r = computeRipple(engineInput({ rotation: resolveRotation(TARGET, null, [], { now: NOW }) }));
    expect(r.kind).toBe("unknown");
    expect(r.probabilities).toBeNull();
    expect(r.thresholds.every((t) => t.risk === "insufficient")).toBe(true);
    expect(r.dataQuality.missing.length).toBeGreaterThan(0);
  });

  it("raises the risk when the incoming aircraft is late and carries it downstream", () => {
    const lateRot = ROT.map((l, i) => (i === 0 ? { ...l, estimatedArrival: new Date("2026-10-10T11:40:00Z"), status: "in_air" as const } : l));
    const r = computeRipple(engineInput({ rotation: resolveRotation(TARGET, "G-EUYA", lateRot, { now: new Date("2026-10-10T09:00:00Z") }) }));
    expect(r.kind).toBe("fallback");
    expect(r.probabilities).toBeNull();
    expect(r.factors[0].id).toBe("incoming");
    expect(r.thresholds.find((t) => t.threshold === 15)!.risk).not.toBe("unlikely");
    expect(r.downstream.map((d) => d.leg.flightNumber)).toEqual(["BA402", "BA403"]);
    expect(r.downstream[0].chain[0]).toMatch(/BA101 to BA402/);
    const onTime = computeRipple(engineInput());
    expect(onTime.thresholds.find((t) => t.threshold === 15)!.risk).toBe("insufficient");
    expect(onTime.factors.find((f) => f.id === "incoming")?.label).toMatch(/no estimate/i);
  });

  it("uses the model only when it is available, and labels the result", () => {
    const model = predictWithArtifact(artifact, "predeparture", JFK_MCO);
    const r = computeRipple(engineInput({ model }));
    expect(r.kind).toBe("ml");
    expect(r.probabilities?.length).toBe(3);
    expect(r.model.version).toBe(artifact.model_version);
    const outside = computeRipple(engineInput({ model: predictWithArtifact(artifact, "predeparture", { ...JFK_MCO, origin: "MAD" }) }));
    expect(outside.probabilities).toBeNull();
    expect(outside.model.unavailableReason).toMatch(/only covers/);
  });

  it("keeps forecasts separate from confirmed outcomes", () => {
    const r = computeRipple(engineInput({ flight: { ...engineInput().flight, status: "landed", actualDeparture: new Date("2026-10-10T12:40:00Z"), actualArrival: new Date("2026-10-10T15:05:00Z"), actualArrivalSource: "gate" } }));
    expect(r.horizon.stage).toBe("after_arrival");
    expect(r.headline).toBe("outcome");
    expect(r.outcome).toMatchObject({ arrivalDelayMin: 90, confirmed: true });
  });

  it("drops links after an aircraft swap and explains the change", () => {
    const before = computeRipple(engineInput());
    const swapped = computeRipple(engineInput({ rotation: resolveRotation(TARGET, "G-NEWA", ROT, { now: new Date("2026-10-10T09:00:00Z"), previousRegistration: "G-EUYA" }) }));
    expect(swapped.rotation.confidence).toBe("unknown");
    expect(swapped.downstream).toHaveLength(0);
    const changes = diffResults(before, swapped);
    expect(changes.some((c) => c.kind === "rotation")).toBe(true);
  });

  it("only lets corroborated reports change the forecast", () => {
    const t = new Date("2026-10-10T11:00:00Z");
    const single = aggregateReports([rep({ type: "delay_announced", contributor: "a", createdAt: t, value: 90 })], t);
    const many = aggregateReports([rep({ type: "delay_announced", contributor: "a", createdAt: t, value: 90 }), rep({ type: "delay_announced", contributor: "b", createdAt: t, value: 90 })], t);
    const base = { rotation: resolveRotation(TARGET, null, [], { now: t }), now: t };
    const r1 = computeRipple(engineInput({ ...base, reports: single }));
    const r2 = computeRipple(engineInput({ ...base, reports: many }));
    expect(r1.thresholds.find((x) => x.threshold === 60)!.risk).toBe("insufficient");
    expect(r1.factors.some((f) => f.id === "unverified_delay_announced")).toBe(true);
    expect(r2.thresholds.find((x) => x.threshold === 60)!.risk).toBe("likely");
  });
});

describe("model honesty", () => {
  it("withholds a threshold whose model did not beat its baseline", () => {
    const p = predictWithArtifact(artifact, "enroute", { ...JFK_MCO, departureDelayMin: 30 });
    if (!p.available) throw new Error("expected prediction");
    const summary = artifact.evaluation_summary.stages.enroute as Record<string, { beats_baseline?: boolean }>;
    for (const t of artifact.thresholds) {
      if (summary[String(t)]?.beats_baseline === false) {
        expect(p.probabilities[String(t)]).toBeUndefined();
        expect(p.withheld.map((w) => w.threshold)).toContain(t);
      } else {
        expect(p.probabilities[String(t)]).toBeTypeOf("number");
      }
    }
  });
});

/* ------------------------------ demo replay ------------------------------ */
import { buildFrames, SCENARIOS } from "@/lib/ripple/sim/scenarios";

describe("Demo Center replay", () => {
  const predictor = (s: "predeparture" | "enroute", i: ModelFlightInput) => predictWithArtifact(artifact, s, i);

  it("is deterministic: rebuilding a scenario gives identical frames", () => {
    for (const s of SCENARIOS) {
      const a = JSON.stringify(buildFrames(s.id, predictor));
      const b = JSON.stringify(buildFrames(s.id, predictor));
      expect(a).toBe(b);
    }
  });

  it("is labelled as simulation and never contains production report sources", () => {
    for (const s of SCENARIOS) {
      for (const f of buildFrames(s.id, predictor)!.frames) {
        expect(f.result.kind).toBe("replay");
        expect(f.result.kindLabel).toMatch(/^Simulation/);
        expect(f.result.reports.claims.every((c) => c.source !== "passengers")).toBe(true);
      }
    }
  });

  it("shows the three-leg cascade: risk rises, spreads downstream, then a swap removes a link", () => {
    const f = buildFrames("cascade", predictor)!.frames;
    const risk15 = (i: number) => f[i].result.thresholds.find((t) => t.threshold === 15)!.risk;
    expect(risk15(0)).toBe("possible");
    expect(f[2].result.downstream.map((d) => d.leg.flightNumber)).toEqual(["B69103", "B69104"]);
    expect(f[5].result.downstream[0].arrival!.mid).toBeGreaterThan(f[2].result.downstream[0].arrival!.mid);
    expect(risk15(5)).toBe("likely");
    expect(f[9].result.downstream.map((d) => d.leg.flightNumber)).not.toContain("B69103");
    expect(f[9].changes.some((c) => /B69103 is no longer linked/.test(c.text))).toBe(true);
    expect(f[10].result.headline).toBe("outcome");
    expect(f[10].result.outcome).toMatchObject({ arrivalDelayMin: 70, confirmed: true });
  });

  it("lowers risk after an aircraft swap and drops unsupported links", () => {
    const f = buildFrames("swap", predictor)!.frames;
    expect(f[0].result.thresholds[0].risk).toBe("possible");
    expect(f[1].result.thresholds[0].risk).toBe("unlikely");
    expect(f[1].result.factors.some((x) => x.id === "swap")).toBe(true);
    expect(f[3].result.rotation.confidence).toBe("unknown");
    expect(f[3].result.downstream).toHaveLength(0);
  });

  it("ignores repeat reports from the same person and marks contradictions", () => {
    const f = buildFrames("reports", predictor)!.frames;
    expect(f[1].result.reports.claims[0].level).toBe("unverified");
    expect(f[2].result.reports.claims[0].level).toBe("strong");
    expect(f[3].changes).toHaveLength(0);
    expect(f[4].result.reports.claims.find((c) => c.type === "boarding_not_started")!.level).toBe("contested");
  });

  it("degrades gracefully when providers fail", () => {
    const f = buildFrames("stale", predictor)!.frames;
    expect(f[1].result.dataQuality.stale.join(" ")).toMatch(/503|minutes old/);
    expect(f[2].result.rotation.confidence).toBe("unknown");
    expect(f[2].result.dataQuality.confidence).not.toBe("good");
    expect(f[3].result.dataQuality.confidence).toBe("good");
  });
});
