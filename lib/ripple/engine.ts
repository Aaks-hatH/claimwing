/**
 * Flight Ripple prediction engine (pure).
 *
 * Takes everything known about one dated flight (provider times, the aircraft rotation, aggregated
 * passenger reports, weather context, and the trained model's output when it applies) and returns
 * one typed, explainable result. It never invents data: every number traces to an input listed in
 * `sources`, missing inputs are listed in `dataQuality`, and the result says whether it came from
 * the trained model, the rule-based estimate, a simulation, or nothing usable.
 *
 * Forecasts, observations and legal assessments stay separate. A forecast here is never passed to
 * the eligibility engine; only confirmed times recorded by the flight tracker are.
 */
import type { AggregateResult, ClaimSummary } from "./reports";
import type { AircraftLeg, RotationResult } from "./rotation";
import { departureToArrival, estimateTurnaround, propagateOnce, riskForThreshold, type DelayEstimate, type MinutesRange, type PropagationStep, type TurnaroundEstimate } from "./propagation";
import type { ModelPrediction } from "./model-core";

export const THRESHOLDS = [15, 60, 180] as const;

export type EngineAirport = { iata: string; name: string; city: string | null; tz: string };

export type EngineFlight = {
  key: string;
  flightNumber: string;
  carrier: string;
  origin: EngineAirport;
  destination: EngineAirport;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  status: "scheduled" | "in_air" | "landed" | "cancelled" | "diverted" | "unknown";
  estimatedArrival?: Date | null;
  estimatedArrivalSource?: string | null;
  actualDeparture?: Date | null;
  actualDepartureSource?: string | null;
  actualArrival?: Date | null;
  actualArrivalSource?: string | null;
  /** When the schedule provider last answered for this flight. */
  providerUpdatedAt?: Date | null;
};

export type ProviderState = {
  scheduleConfigured: boolean;
  aircraftLookup: "available" | "unsupported" | "not_configured" | "error" | "simulated";
  errors: string[];
};

export type EngineInput = {
  flight: EngineFlight;
  rotation: RotationResult;
  reports: AggregateResult;
  weather: { severe: boolean; summary: string; fetchedAt: string; source: string } | null;
  model: ModelPrediction | null;
  measuredTurnaround?: Record<string, number> | null;
  provider: ProviderState;
  now: Date;
  mode: "live" | "simulation";
};

export type LegState = "observed" | "estimated" | "predicted" | "scheduled" | "unknown";

export type LegView = {
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  estimatedArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  status: AircraftLeg["status"];
  arrivalDelay: { low: number; mid: number; high: number; state: LegState } | null;
  role: "incoming" | "target" | "downstream";
};

export type Factor = {
  id: string;
  label: string;
  effect: "raises" | "lowers" | "neutral" | "unknown";
  weight: "major" | "minor";
  kind: "observed" | "reported" | "predicted" | "context";
  detail: string;
  sources: Array<{ label: string; at: string | null }>;
};

export type RippleLink = {
  airport: string;
  fromFlight: string;
  toFlight: string;
  scheduledGroundMin: number;
  turnaround: TurnaroundEstimate;
  step: PropagationStep | null;
};

export type DownstreamForecast = {
  leg: LegView;
  knockOnDeparture: MinutesRange | null;
  arrival: MinutesRange | null;
  risks: Array<{ threshold: number; risk: ReturnType<typeof riskForThreshold> }>;
  explanation: string;
  chain: string[];
};

export type RippleResult = {
  version: 1;
  flight: { key: string; flightNumber: string; origin: string; destination: string; scheduledDeparture: string; scheduledArrival: string };
  computedAt: string;
  horizon: { stage: "predeparture" | "enroute" | "after_arrival" | "cancelled"; minutesToDeparture: number; label: string };
  kind: "ml" | "fallback" | "replay" | "unknown";
  kindLabel: string;
  headline: "model" | "evidence" | "outcome" | "none";
  /** Only present when the trained model produced them; never for the rule-based estimate. */
  probabilities: Array<{ threshold: number; probability: number }> | null;
  thresholds: Array<{ threshold: number; risk: ReturnType<typeof riskForThreshold>; basis: string }>;
  expectedArrivalDelay: { range: MinutesRange | null; modelMedian: number | null; basis: string };
  outcome: { arrivalDelayMin: number | null; departureDelayMin: number | null; source: string | null; confirmed: boolean } | null;
  rotation: {
    confidence: RotationResult["confidence"];
    registration: string | null;
    aircraftModel: string | null;
    reasons: string[];
    legs: LegView[];
    links: RippleLink[];
    swap: RotationResult["swap"];
    source: string | null;
    observedAt: string | null;
  };
  downstream: DownstreamForecast[];
  factors: Factor[];
  reports: AggregateResult;
  dataQuality: { confidence: "good" | "limited" | "poor"; missing: string[]; stale: string[]; conflicts: string[] };
  sources: Array<{ name: string; kind: "provider" | "aircraft" | "passengers" | "weather" | "model" | "simulation"; updatedAt: string | null }>;
  model: {
    used: boolean;
    version: string | null;
    trainedAt: string | null;
    dataset: string | null;
    stage: "predeparture" | "enroute" | null;
    evaluation: Record<string, unknown> | null;
    unavailableReason: string | null;
    calibrated: Record<string, boolean> | null;
    withheld: Array<{ threshold: number; reason: string }>;
  };
  disclaimer: string;
};

const DISCLAIMER =
  "Flight Ripple is a forecast, not an airline status and not legal advice. Compensation depends on the confirmed arrival time and the rules that apply, which ClaimWing checks separately.";

const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const pt = (n: number): MinutesRange => ({ low: n, mid: n, high: n });

function strongish(c: ClaimSummary | undefined) {
  return c && (c.level === "strong" || c.level === "some");
}

/** How far an estimate can move: wider when the event is further away. */
function estimateBand(value: number, minutesAway: number): MinutesRange {
  const spread = Math.min(60, Math.max(10, Math.round(minutesAway / 6)));
  return { low: Math.max(0, value - spread), mid: Math.max(0, value), high: Math.max(0, value + spread) };
}

function inboundDelay(leg: AircraftLeg, now: Date): DelayEstimate {
  if (leg.actualArrival) {
    const d = minutesBetween(leg.scheduledArrival, leg.actualArrival);
    return { ...pt(Math.max(0, d)), kind: "observed", basis: `${leg.flightNumber} arrived ${fmtMin(d)} (${leg.source})` };
  }
  if (leg.estimatedArrival) {
    const d = minutesBetween(leg.scheduledArrival, leg.estimatedArrival);
    const band = estimateBand(d, Math.max(0, minutesBetween(now, leg.estimatedArrival)));
    return { ...band, kind: "estimated", basis: `${leg.flightNumber} is estimated to arrive ${fmtMin(d)} (${leg.source})` };
  }
  if (leg.status === "cancelled") return { low: 0, mid: 0, high: 0, kind: "unknown", basis: `${leg.flightNumber} is cancelled, so this aircraft may not arrive at all` };
  return { low: 0, mid: 0, high: 0, kind: "unknown", basis: `No arrival estimate yet for ${leg.flightNumber}` };
}

function fmtMin(d: number) {
  if (Math.abs(d) < 1) return "on time";
  const a = Math.abs(d);
  const h = Math.floor(a / 60);
  const m = a % 60;
  const t = h ? `${h} h ${m} min` : `${m} min`;
  return d > 0 ? `${t} late` : `${t} early`;
}

function legView(leg: AircraftLeg, role: LegView["role"], delay: LegView["arrivalDelay"]): LegView {
  return {
    flightNumber: leg.flightNumber,
    date: leg.date,
    origin: leg.origin,
    destination: leg.destination,
    scheduledDeparture: leg.scheduledDeparture.toISOString(),
    scheduledArrival: leg.scheduledArrival.toISOString(),
    estimatedArrival: iso(leg.estimatedArrival),
    actualDeparture: iso(leg.actualDeparture),
    actualArrival: iso(leg.actualArrival),
    status: leg.status,
    arrivalDelay: delay,
    role,
  };
}

function maxRange(ranges: MinutesRange[]): MinutesRange | null {
  if (!ranges.length) return null;
  return {
    low: Math.max(...ranges.map((r) => r.low)),
    mid: Math.max(...ranges.map((r) => r.mid)),
    high: Math.max(...ranges.map((r) => r.high)),
  };
}

export function computeRipple(input: EngineInput): RippleResult {
  const { flight: f, rotation, reports, weather, model, now } = input;
  const factors: Factor[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  const conflicts: string[] = [];
  const sources: RippleResult["sources"] = [];
  const minutesToDeparture = minutesBetween(now, f.scheduledDeparture);
  const claim = (t: ClaimSummary["type"]) => reports.claims.find((c) => c.type === t);

  /* ---------- Stage and confirmed outcome ---------- */
  const depDelayObserved = f.actualDeparture ? minutesBetween(f.scheduledDeparture, f.actualDeparture) : null;
  const arrDelayObserved = f.actualArrival ? minutesBetween(f.scheduledArrival, f.actualArrival) : null;
  const stage: RippleResult["horizon"]["stage"] =
    f.status === "cancelled" ? "cancelled" : f.actualArrival ? "after_arrival" : f.actualDeparture || f.status === "in_air" ? "enroute" : "predeparture";
  const horizonLabel =
    stage === "after_arrival"
      ? "The flight has arrived. These are recorded times, not a forecast."
      : stage === "cancelled"
        ? "The flight is reported cancelled."
        : stage === "enroute"
          ? "En-route update: the aircraft has left the gate."
          : minutesToDeparture > 0
            ? `Pre-departure forecast, ${fmtHorizon(minutesToDeparture)} before scheduled departure.`
            : "Departure time has passed without a confirmed departure.";

  if (f.providerUpdatedAt) sources.push({ name: f.estimatedArrivalSource ?? f.actualArrivalSource ?? "Flight schedule data", kind: "provider", updatedAt: iso(f.providerUpdatedAt) });
  if (!input.provider.scheduleConfigured && input.mode === "live") missing.push("Live schedule data (no schedule provider is configured, so estimated times come only from aircraft positions)");
  if (input.provider.errors.length) stale.push(`A data provider returned an error: ${input.provider.errors[0]}`);
  if (f.providerUpdatedAt && stage !== "after_arrival" && minutesBetween(f.providerUpdatedAt, now) > 45 && Math.abs(minutesToDeparture) < 6 * 60) {
    stale.push(`Schedule data is ${minutesBetween(f.providerUpdatedAt, now)} minutes old`);
  }

  /* ---------- Rotation and turnaround ---------- */
  const links: RippleLink[] = [];
  const legs: LegView[] = [];
  let knockOn: MinutesRange | null = null;
  let firstStep: PropagationStep | null = null;
  if (rotation.target) {
    if (rotation.incoming) {
      const inbound = inboundDelay(rotation.incoming, now);
      const link = rotation.links[0];
      const turn = estimateTurnaround({ aircraftModel: rotation.aircraftModel, carrier: f.carrier, airport: f.origin.iata }, input.measuredTurnaround);
      const step = inbound.kind === "unknown" ? null : propagateOnce(link.scheduledGroundMin, inbound, turn);
      firstStep = step;
      links.push({ airport: link.airport, fromFlight: rotation.incoming.flightNumber, toFlight: f.flightNumber, scheduledGroundMin: link.scheduledGroundMin, turnaround: turn, step });
      legs.push(legView(rotation.incoming, "incoming", inbound.kind === "unknown" ? null : { low: inbound.low, mid: inbound.mid, high: inbound.high, state: inbound.kind }));
      if (stage === "predeparture" && step) {
        knockOn = step.knockOnDepartureDelay;
        factors.push({
          id: "incoming",
          label: step.outcome === "absorbed" ? "Incoming aircraft has enough time" : step.outcome === "tight" ? "Tight turnaround" : "Incoming aircraft is late",
          effect: step.outcome === "absorbed" ? "lowers" : "raises",
          weight: step.outcome === "propagates" ? "major" : "minor",
          kind: inbound.kind === "observed" ? "observed" : "predicted",
          detail: step.explanation,
          sources: [{ label: inbound.basis, at: rotation.observedAt }, { label: turn.basis, at: null }],
        });
        if (!turn.measured) missing.push("Measured turnaround times for this airline and airport (a typical range by aircraft size is used)");
      } else if (stage === "predeparture") {
        factors.push({ id: "incoming", label: "Incoming flight has no estimate yet", effect: "unknown", weight: "minor", kind: "context", detail: inbound.basis, sources: [{ label: rotation.source ?? "Aircraft data", at: rotation.observedAt }] });
        missing.push(`An arrival estimate for the incoming flight ${rotation.incoming.flightNumber}`);
      }
      const incomingAge = rotation.observedAt ? minutesBetween(new Date(rotation.observedAt), now) : null;
      if (incomingAge !== null && incomingAge > 30 && stage === "predeparture" && minutesToDeparture < 4 * 60) stale.push(`Aircraft and incoming-flight data are ${incomingAge} minutes old`);
    }
    sources.push({ name: rotation.source ?? "Aircraft assignment data", kind: "aircraft", updatedAt: rotation.observedAt });
  } else {
    missing.push(rotation.reasons[0] ?? "The aircraft assignment for this flight");
    factors.push({ id: "rotation_unknown", label: "Incoming aircraft unknown", effect: "unknown", weight: "minor", kind: "context", detail: rotation.reasons[0] ?? "No aircraft assignment is available.", sources: [] });
  }
  if (rotation.swap) {
    factors.push({
      id: "swap",
      label: "Aircraft changed",
      effect: "neutral",
      weight: "major",
      kind: "observed",
      detail: `The aircraft for this flight changed from ${rotation.swap.previous} to ${rotation.swap.current}. Links based on the old aircraft were removed.`,
      sources: [{ label: rotation.source ?? "Aircraft data", at: rotation.observedAt }],
    });
  }
  if (rotation.confidence === "planned") conflicts.push("The aircraft assignment is still the airline's plan and may change.");

  /* ---------- Live evidence for the target ---------- */
  const evidence: Array<{ range: MinutesRange; basis: string }> = [];
  if (arrDelayObserved !== null) {
    evidence.push({ range: pt(Math.max(0, arrDelayObserved)), basis: `Recorded arrival (${f.actualArrivalSource ?? "flight data"})` });
  } else {
    if (f.estimatedArrival && stage !== "cancelled") {
      const d = minutesBetween(f.scheduledArrival, f.estimatedArrival);
      evidence.push({ range: estimateBand(d, Math.max(0, minutesBetween(now, f.estimatedArrival))), basis: `Estimated arrival ${fmtMin(d)} (${f.estimatedArrivalSource ?? "flight data"})` });
      factors.push({
        id: "provider_eta",
        label: d >= 15 ? "Estimated arrival is late" : "Estimated arrival is on time",
        effect: d >= 15 ? "raises" : "lowers",
        weight: "major",
        kind: "observed",
        detail: `The latest estimate puts arrival ${fmtMin(d)}.`,
        sources: [{ label: f.estimatedArrivalSource ?? "Flight data", at: iso(f.providerUpdatedAt) }],
      });
    }
    if (depDelayObserved !== null) {
      const block = minutesBetween(f.scheduledDeparture, f.scheduledArrival);
      evidence.push({ range: departureToArrival(pt(Math.max(0, depDelayObserved)), block), basis: `Departed ${fmtMin(depDelayObserved)}` });
      factors.push({
        id: "departure",
        label: depDelayObserved >= 15 ? "Departed late" : "Departed on time",
        effect: depDelayObserved >= 15 ? "raises" : "lowers",
        weight: "major",
        kind: "observed",
        detail: `The aircraft left ${fmtMin(depDelayObserved)}. Some of that can be made up in the air.`,
        sources: [{ label: f.actualDepartureSource ?? "Flight data", at: iso(f.actualDeparture) }],
      });
    }
    if (knockOn) {
      const block = minutesBetween(f.scheduledDeparture, f.scheduledArrival);
      evidence.push({ range: departureToArrival(knockOn, block), basis: "Knock-on delay from the incoming aircraft" });
    }
  }

  /* ---------- Passenger reports ---------- */
  const announced = claim("delay_announced");
  if (strongish(announced) && stage === "predeparture") {
    const v = typeof announced!.value === "number" ? announced!.value : null;
    if (v) evidence.push({ range: { low: Math.round(v * 0.8), mid: v, high: Math.round(v * 1.3) }, basis: `Passengers report an announced delay of about ${v} min` });
    factors.push({ id: "report_delay", label: "Delay announced at the gate", effect: "raises", weight: v && v >= 60 ? "major" : "minor", kind: "reported", detail: `${announced!.levelLabel}: ${announced!.contributorsLabel} report a delay announcement${v ? ` of about ${v} minutes` : ""}.`, sources: [{ label: "Reported by passengers", at: announced!.lastAt }] });
  }
  const noAircraft = claim("incoming_aircraft_not_at_gate");
  if (strongish(noAircraft) && stage === "predeparture" && minutesToDeparture < 60) {
    const turn = estimateTurnaround({ aircraftModel: rotation.aircraftModel, carrier: f.carrier, airport: f.origin.iata }, input.measuredTurnaround);
    const lowest = Math.max(0, turn.low - Math.max(0, minutesToDeparture));
    evidence.push({ range: { low: lowest, mid: Math.max(0, turn.mid - Math.max(0, minutesToDeparture)), high: Math.max(0, turn.high - Math.max(0, minutesToDeparture)) + 15 }, basis: "No aircraft at the gate close to departure" });
    factors.push({ id: "report_no_aircraft", label: "No aircraft at the gate", effect: "raises", weight: "major", kind: "reported", detail: `${noAircraft!.levelLabel}: passengers report no aircraft at the gate ${minutesToDeparture} minutes before departure. Even a quick turnaround takes about ${turn.low} minutes.`, sources: [{ label: "Reported by passengers", at: noAircraft!.lastAt }] });
  }
  for (const [type, label, effect] of [
    ["boarding_started", "Boarding has started", "lowers"],
    ["doors_closed", "Doors closed", "lowers"],
    ["deplaning", "Passengers asked to deplane", "raises"],
    ["cancellation_announced", "Cancellation reported", "raises"],
    ["incoming_aircraft_at_gate", "Aircraft is at the gate", "lowers"],
  ] as const) {
    const c = claim(type);
    if (!c) continue;
    if (strongish(c)) {
      factors.push({ id: `report_${type}`, label, effect, weight: type === "cancellation_announced" || type === "deplaning" ? "major" : "minor", kind: "reported", detail: `${c.levelLabel}: ${c.contributorsLabel}, last ${c.ageMinutes} min ago.`, sources: [{ label: "Reported by passengers", at: c.lastAt }] });
    }
  }
  for (const c of reports.claims) {
    if (c.level === "contested") conflicts.push(`Passengers disagree about "${c.label.toLowerCase()}".`);
    if (c.level === "unverified" && c.source === "passengers") {
      factors.push({ id: `unverified_${c.type}`, label: `${c.label} (unverified)`, effect: "neutral", weight: "minor", kind: "reported", detail: "A single report. It's shown, but it doesn't change the forecast until someone else confirms it.", sources: [{ label: "Reported by a passenger", at: c.lastAt }] });
    }
  }
  // Consistency with official data.
  const departedClaim = claim("departed");
  if (stage === "predeparture" && strongish(departedClaim) && f.status === "scheduled" && f.providerUpdatedAt) {
    conflicts.push("Passengers report the aircraft has left, but the flight data hasn't caught up yet.");
  }
  if (!reports.totalReports) missing.push("Passenger reports for this flight (none yet)");
  if (reports.totalReports) sources.push({ name: input.mode === "simulation" ? "Simulated passenger reports" : "Passenger reports", kind: input.mode === "simulation" ? "simulation" : "passengers", updatedAt: reports.claims[0]?.lastAt ?? null });

  /* ---------- Weather ---------- */
  if (weather) {
    sources.push({ name: weather.source, kind: "weather", updatedAt: weather.fetchedAt });
    factors.push({ id: "weather", label: weather.severe ? "Severe weather near departure" : "Weather", effect: weather.severe ? "raises" : "neutral", weight: weather.severe ? "major" : "minor", kind: "context", detail: weather.summary, sources: [{ label: weather.source, at: weather.fetchedAt }] });
  } else if (stage === "predeparture") {
    missing.push("Weather at the departure airport");
  }

  /* ---------- Model ---------- */
  const modelOk = model && model.available ? model : null;
  if (model && !model.available) missing.push(model.reason);
  if (modelOk) {
    sources.push({ name: `Trained model ${modelOk.modelVersion}`, kind: "model", updatedAt: modelOk.trainedAt });
    for (const m of modelOk.missingInputs) missing.push(`Model input: ${m}`);
    const p15 = modelOk.probabilities["15"] ?? 0;
    if (modelOk.probabilities["15"] !== undefined) factors.push({
      id: "history",
      label: "Historical pattern",
      effect: p15 >= 0.35 ? "raises" : p15 <= 0.15 ? "lowers" : "neutral",
      weight: "minor",
      kind: "predicted",
      detail: `On flights like this one (same route, time of day, season and weather), the model estimates a ${Math.round(p15 * 100)}% chance of arriving 15 minutes or more late.`,
      sources: [{ label: modelOk.dataset, at: modelOk.trainedAt }],
    });
  }

  /* ---------- Combine ---------- */
  const evidenceRange = maxRange(evidence.map((e) => e.range));
  const hasLiveEvidence = evidence.length > 0;
  const headline: RippleResult["headline"] =
    stage === "after_arrival" ? "outcome" : hasLiveEvidence && !(modelOk && stage === "enroute" && !f.estimatedArrival) ? "evidence" : modelOk ? "model" : hasLiveEvidence ? "evidence" : "none";
  const thresholds = THRESHOLDS.map((t) => {
    const p = modelOk?.probabilities[String(t)];
    if (headline === "model" && p !== undefined) {
      return { threshold: t, risk: p >= 0.5 ? "likely" : p >= 0.15 ? "possible" : "unlikely", basis: "Trained model" } as const;
    }
    return { threshold: t, risk: riskForThreshold(evidenceRange, t), basis: evidenceRange ? evidence.map((e) => e.basis).join("; ") : "No usable evidence yet" };
  });

  const kind: RippleResult["kind"] = input.mode === "simulation" ? "replay" : modelOk ? "ml" : hasLiveEvidence ? "fallback" : "unknown";
  const kindLabel =
    kind === "replay"
      ? modelOk
        ? "Simulation. Probabilities come from the trained model applied to simulated inputs."
        : "Simulation. Rule-based estimate on simulated data."
      : kind === "ml"
        ? `Trained model (${modelOk!.modelVersion})`
        : kind === "fallback"
          ? "Rule-based estimate from live evidence (no trained model applies to this flight)"
          : "Insufficient data";

  /* ---------- Downstream ripple ---------- */
  const downstream: DownstreamForecast[] = [];
  const targetArrival: MinutesRange | null =
    arrDelayObserved !== null ? pt(Math.max(0, arrDelayObserved)) : evidenceRange ?? (modelOk && Number.isFinite(modelOk.expectedDelayMin) ? estimateBand(Math.max(0, modelOk.expectedDelayMin), Math.max(0, minutesToDeparture) + 60) : null);
  if (rotation.target) {
    legs.push(legView(rotation.target, "target", targetArrival ? { ...targetArrival, state: arrDelayObserved !== null ? "observed" : evidenceRange ? "estimated" : "predicted" } : null));
    let inbound: DelayEstimate | null = targetArrival ? { ...targetArrival, kind: arrDelayObserved !== null ? "observed" : "predicted", basis: `${f.flightNumber} arrival` } : null;
    let prev = rotation.target;
    const chain: string[] = [];
    for (const leg of rotation.subsequent) {
      const link = rotation.links.find((l) => l.to === leg)!;
      const turn = estimateTurnaround({ aircraftModel: rotation.aircraftModel, carrier: f.carrier, airport: leg.origin }, input.measuredTurnaround);
      if (!inbound) {
        links.push({ airport: leg.origin, fromFlight: prev.flightNumber, toFlight: leg.flightNumber, scheduledGroundMin: link.scheduledGroundMin, turnaround: turn, step: null });
        const v = legView(leg, "downstream", null);
        legs.push(v);
        downstream.push({ leg: v, knockOnDeparture: null, arrival: null, risks: THRESHOLDS.map((t) => ({ threshold: t, risk: "insufficient" as const })), explanation: `There isn't enough information about ${prev.flightNumber} to estimate the effect on ${leg.flightNumber}.`, chain: [...chain] });
        prev = leg;
        continue;
      }
      const step = propagateOnce(link.scheduledGroundMin, inbound, turn);
      links.push({ airport: leg.origin, fromFlight: prev.flightNumber, toFlight: leg.flightNumber, scheduledGroundMin: link.scheduledGroundMin, turnaround: turn, step });
      const block = minutesBetween(leg.scheduledDeparture, leg.scheduledArrival);
      const arr = departureToArrival(step.knockOnDepartureDelay, block);
      chain.push(`${prev.flightNumber} to ${leg.flightNumber} at ${leg.origin}: ${step.explanation}`);
      const v = legView(leg, "downstream", leg.actualArrival ? { ...pt(Math.max(0, minutesBetween(leg.scheduledArrival, leg.actualArrival))), state: "observed" } : { ...arr, state: "predicted" });
      legs.push(v);
      downstream.push({
        leg: v,
        knockOnDeparture: step.knockOnDepartureDelay,
        arrival: arr,
        risks: THRESHOLDS.map((t) => ({ threshold: t, risk: riskForThreshold(arr, t) })),
        explanation: step.explanation + (rotation.confidence === "planned" ? " The aircraft assignment may still change." : ""),
        chain: [...chain],
      });
      inbound = { ...arr, kind: "predicted", basis: `${leg.flightNumber} arrival` };
      prev = leg;
    }
  }
  void firstStep;
  if (!rotation.target) {
    // No rotation: still show the user's own flight, built only from its own data.
    legs.push({
      flightNumber: f.flightNumber,
      date: f.key.split(":")[1] ?? "",
      origin: f.origin.iata,
      destination: f.destination.iata,
      scheduledDeparture: f.scheduledDeparture.toISOString(),
      scheduledArrival: f.scheduledArrival.toISOString(),
      estimatedArrival: iso(f.estimatedArrival),
      actualDeparture: iso(f.actualDeparture),
      actualArrival: iso(f.actualArrival),
      status: f.status,
      arrivalDelay: targetArrival ? { ...targetArrival, state: arrDelayObserved !== null ? "observed" : evidenceRange ? "estimated" : "predicted" } : null,
      role: "target",
    });
  }

  /* ---------- Confidence ---------- */
  const haveLive = Boolean(f.providerUpdatedAt) || hasLiveEvidence;
  const confidence: RippleResult["dataQuality"]["confidence"] =
    !haveLive && !modelOk ? "poor" : stale.length || conflicts.length || rotation.confidence === "unknown" || missing.length > 3 ? "limited" : "good";

  return {
    version: 1,
    flight: { key: f.key, flightNumber: f.flightNumber, origin: f.origin.iata, destination: f.destination.iata, scheduledDeparture: f.scheduledDeparture.toISOString(), scheduledArrival: f.scheduledArrival.toISOString() },
    computedAt: now.toISOString(),
    horizon: { stage, minutesToDeparture, label: horizonLabel },
    kind,
    kindLabel,
    headline,
    probabilities: modelOk ? THRESHOLDS.filter((t) => modelOk.probabilities[String(t)] !== undefined).map((t) => ({ threshold: t, probability: modelOk.probabilities[String(t)] })) : null,
    thresholds: thresholds.map((t) => ({ ...t })),
    expectedArrivalDelay: {
      range: arrDelayObserved !== null ? pt(Math.max(0, arrDelayObserved)) : evidenceRange,
      modelMedian: modelOk && Number.isFinite(modelOk.expectedDelayMin) ? modelOk.expectedDelayMin : null,
      basis: arrDelayObserved !== null ? "Recorded arrival time" : evidence.length ? evidence.map((e) => e.basis).join("; ") : modelOk ? "Trained model only" : "No usable evidence yet",
    },
    outcome:
      depDelayObserved !== null || arrDelayObserved !== null
        ? { arrivalDelayMin: arrDelayObserved, departureDelayMin: depDelayObserved, source: f.actualArrivalSource ?? f.actualDepartureSource ?? null, confirmed: arrDelayObserved !== null }
        : null,
    rotation: {
      confidence: rotation.confidence,
      registration: rotation.registration,
      aircraftModel: rotation.aircraftModel,
      reasons: rotation.reasons,
      legs,
      links,
      swap: rotation.swap,
      source: rotation.source,
      observedAt: rotation.observedAt,
    },
    downstream,
    factors: sortFactors(factors),
    reports,
    dataQuality: { confidence, missing: dedupe(missing), stale: dedupe(stale), conflicts: dedupe(conflicts) },
    sources,
    model: modelOk
      ? { used: true, version: modelOk.modelVersion, trainedAt: modelOk.trainedAt, dataset: modelOk.dataset, stage: modelOk.stage, evaluation: modelOk.evaluation, unavailableReason: null, calibrated: modelOk.calibrated, withheld: modelOk.withheld }
      : { used: false, version: model?.modelVersion ?? null, trainedAt: null, dataset: null, stage: null, evaluation: null, unavailableReason: model && !model.available ? model.reason : null, calibrated: null, withheld: [] },
    disclaimer: DISCLAIMER,
  };
}

function sortFactors(f: Factor[]) {
  const w = (x: Factor) => (x.weight === "major" ? 0 : 1) * 10 + (x.effect === "raises" ? 0 : x.effect === "lowers" ? 1 : x.effect === "unknown" ? 2 : 3);
  return [...f].sort((a, b) => w(a) - w(b));
}

function dedupe(a: string[]) {
  return [...new Set(a)];
}

function fmtHorizon(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min`;
  return `${Math.round(h / 24)} days`;
}

/* --------------------------------- What changed? --------------------------------- */

export type RippleChange = { kind: "risk" | "factor_added" | "factor_removed" | "range" | "rotation" | "model"; text: string };

/** Compares two results for the same flight and explains what changed, in plain language. */
export function diffResults(prev: RippleResult | null, cur: RippleResult): RippleChange[] {
  if (!prev) return [];
  const out: RippleChange[] = [];
  for (const t of cur.thresholds) {
    const p = prev.thresholds.find((x) => x.threshold === t.threshold);
    if (p && p.risk !== t.risk) out.push({ kind: "risk", text: `Delay of ${t.threshold}+ min: ${p.risk} to ${t.risk}` });
  }
  if (prev.probabilities && cur.probabilities) {
    for (const c of cur.probabilities) {
      const p = prev.probabilities.find((x) => x.threshold === c.threshold);
      if (p && Math.abs(p.probability - c.probability) >= 0.05) out.push({ kind: "model", text: `Model chance of ${c.threshold}+ min: ${Math.round(p.probability * 100)}% to ${Math.round(c.probability * 100)}%` });
    }
  }
  const pf = new Set(prev.factors.map((f) => f.id));
  const cf = new Set(cur.factors.map((f) => f.id));
  for (const f of cur.factors) if (!pf.has(f.id)) out.push({ kind: "factor_added", text: `New: ${f.label}` });
  for (const f of prev.factors) if (!cf.has(f.id)) out.push({ kind: "factor_removed", text: `No longer applies: ${f.label}` });
  for (const f of cur.factors) {
    const p = prev.factors.find((x) => x.id === f.id);
    if (p && p.kind !== f.kind) out.push({ kind: "factor_added", text: `${f.label}: now ${f.kind === "observed" ? "observed" : f.kind}, was ${p.kind}` });
    else if (p && p.effect !== f.effect) out.push({ kind: "factor_added", text: `${f.label}: effect changed` });
  }
  const pd = new Set(prev.downstream.map((d) => d.leg.flightNumber));
  const cd = new Set(cur.downstream.map((d) => d.leg.flightNumber));
  for (const d of prev.downstream) if (!cd.has(d.leg.flightNumber)) out.push({ kind: "rotation", text: `${d.leg.flightNumber} is no longer linked to this aircraft` });
  for (const d of cur.downstream) if (!pd.has(d.leg.flightNumber)) out.push({ kind: "rotation", text: `${d.leg.flightNumber} is now the aircraft's next flight` });
  const pr = prev.expectedArrivalDelay.range;
  const cr = cur.expectedArrivalDelay.range;
  if (pr && cr && Math.abs(pr.mid - cr.mid) >= 10) out.push({ kind: "range", text: `Expected arrival delay: about ${pr.mid} min to about ${cr.mid} min` });
  if (!pr && cr) out.push({ kind: "range", text: `Expected arrival delay is now about ${cr.mid} min` });
  if (prev.rotation.registration !== cur.rotation.registration) out.push({ kind: "rotation", text: `Aircraft: ${prev.rotation.registration ?? "unknown"} to ${cur.rotation.registration ?? "unknown"}` });
  else if (prev.rotation.confidence !== cur.rotation.confidence) out.push({ kind: "rotation", text: `Aircraft link: ${prev.rotation.confidence} to ${cur.rotation.confidence}` });
  return out;
}
