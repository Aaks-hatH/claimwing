/**
 * Turnaround and delay propagation.
 *
 *   predicted_inbound_arrival = scheduled_inbound_arrival + predicted_arrival_delay
 *   remaining_turnaround      = target_scheduled_departure - predicted_inbound_arrival
 *   knock_on_departure_delay  = max(0, needed_turnaround - remaining_turnaround)
 *
 * "Needed turnaround" is never one fixed number. It is a range (low, typical, high) that depends on
 * the aircraft size and the airline type, and, when the trained artifact includes them, on measured
 * short turnarounds for that airline and airport. Every number carries that range through the chain,
 * so the result is a band of minutes, not a single false-precision value.
 */

export type MinutesRange = { low: number; mid: number; high: number };

export type TurnaroundEstimate = MinutesRange & {
  basis: string;
  measured: boolean;
};

const WIDEBODY = /(A30|A33|A34|A35|A38|B74|B76|B77|B78|747|767|777|787|330|340|350|380|IL96|MD11)/i;
const REGIONAL = /(CRJ|ERJ|E1[79]\d|E75|EMB|ATR|DH8|DHC|Q400|Dash|SF34|SAAB|E-?Jet|Embraer 1[79]|CS1|Fokker)/i;
const LOW_COST = new Set(["FR", "U2", "W6", "WN", "NK", "G4", "F9", "VY", "PC", "DY", "EW", "LS", "W9", "B6", "TO", "HV"]);

/**
 * @param measured optional artifact table: "CARRIER|AIRPORT" -> 10th percentile of scheduled ground time
 */
export function estimateTurnaround(
  opts: { aircraftModel?: string | null; carrier?: string | null; airport?: string | null },
  measured?: Record<string, number> | null,
): TurnaroundEstimate {
  const key = `${opts.carrier ?? ""}|${opts.airport ?? ""}`;
  if (measured && opts.carrier && opts.airport && measured[key] !== undefined) {
    const m = measured[key];
    return { low: Math.max(15, Math.round(m * 0.8)), mid: Math.round(m), high: Math.round(m * 1.3), basis: `Short turnarounds measured for ${opts.carrier} at ${opts.airport} in historical data`, measured: true };
  }
  const model = opts.aircraftModel ?? "";
  const lowCost = opts.carrier ? LOW_COST.has(opts.carrier.toUpperCase()) : false;
  if (model && WIDEBODY.test(model)) {
    return { low: 60, mid: 80, high: 110, basis: `Typical range for a wide-body aircraft (${model})`, measured: false };
  }
  if (model && REGIONAL.test(model)) {
    return { low: 20, mid: 30, high: 40, basis: `Typical range for a regional aircraft (${model})`, measured: false };
  }
  if (model) {
    return lowCost
      ? { low: 25, mid: 30, high: 45, basis: `Typical range for a narrow-body aircraft on a low-cost schedule (${model})`, measured: false }
      : { low: 30, mid: 40, high: 55, basis: `Typical range for a narrow-body aircraft (${model})`, measured: false };
  }
  return { low: 25, mid: 45, high: 90, basis: "Aircraft type unknown, so a wide range is used", measured: false };
}

export type DelayEstimate = MinutesRange & {
  kind: "observed" | "estimated" | "predicted" | "unknown";
  basis: string;
};

export type PropagationStep = {
  scheduledGroundMin: number;
  remainingTurnaroundMin: MinutesRange;
  turnaround: TurnaroundEstimate;
  inboundArrivalDelay: DelayEstimate;
  knockOnDepartureDelay: MinutesRange;
  /** "absorbed": the buffer soaks up the delay; "tight": it might not; "propagates": it won't. */
  outcome: "absorbed" | "tight" | "propagates";
  explanation: string;
};

const clamp0 = (n: number) => Math.max(0, Math.round(n));

/** One turnaround: how much of the inbound delay reaches the next departure. */
export function propagateOnce(scheduledGroundMin: number, inbound: DelayEstimate, turn: TurnaroundEstimate): PropagationStep {
  // Lower bound: a small inbound delay and a quick turn. Upper bound: a large inbound delay and a slow turn.
  const remaining: MinutesRange = {
    low: Math.round(scheduledGroundMin - inbound.high),
    mid: Math.round(scheduledGroundMin - inbound.mid),
    high: Math.round(scheduledGroundMin - inbound.low),
  };
  const knock: MinutesRange = {
    low: clamp0(turn.low - remaining.high),
    mid: clamp0(turn.mid - remaining.mid),
    high: clamp0(turn.high - remaining.low),
  };
  const outcome: PropagationStep["outcome"] = knock.high === 0 ? "absorbed" : knock.low > 0 ? "propagates" : "tight";
  const fmt = (n: number) => `${n} min`;
  const explanation =
    inbound.kind === "unknown"
      ? "The incoming flight's arrival time is unknown, so the effect on this departure can't be estimated."
      : outcome === "absorbed"
        ? `The aircraft is due on the ground ${fmt(Math.max(0, remaining.mid))} before departure, more than the ${turn.low} to ${turn.high} min it usually needs, so the delay should be absorbed.`
        : outcome === "tight"
          ? `The aircraft is due on the ground about ${fmt(Math.max(0, remaining.mid))} before departure. It usually needs ${turn.low} to ${turn.high} min, so the turnaround is tight and the departure could slip by up to ${fmt(knock.high)}.`
          : `The incoming aircraft is expected to arrive late, leaving ${remaining.mid <= 0 ? "no time" : `only about ${fmt(remaining.mid)}`} before the next departure. It usually needs at least ${turn.low} min, so a knock-on delay of roughly ${knock.low} to ${knock.high} min is likely.`;
  return { scheduledGroundMin, remainingTurnaroundMin: remaining, turnaround: turn, inboundArrivalDelay: inbound, knockOnDepartureDelay: knock, outcome, explanation };
}

/**
 * Carries a departure delay to arrival. Without a model of en-route recovery, the arrival delay is
 * assumed equal to the departure delay, with a modest recovery allowance on the low end only.
 */
export function departureToArrival(dep: MinutesRange, blockMin: number): MinutesRange {
  const recovery = Math.min(20, Math.round(blockMin * 0.08));
  return { low: clamp0(dep.low - recovery), mid: clamp0(dep.mid - recovery / 2), high: clamp0(dep.high) };
}

export function riskForThreshold(r: MinutesRange | null, threshold: number): "likely" | "possible" | "unlikely" | "insufficient" {
  if (!r) return "insufficient";
  if (r.low >= threshold) return "likely";
  if (r.high >= threshold) return "possible";
  return "unlikely";
}
