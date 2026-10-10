/**
 * Aircraft Network: resolve which flights the same aircraft flies before and after yours.
 *
 * Rules that prevent false links:
 * - A link needs an aircraft identity (registration) from a data provider. Two flights are never
 *   linked because they share a flight number, or because one goes A to B and the other B to A.
 * - Your flight must appear in that aircraft's list of legs (same flight number, same origin,
 *   scheduled departure within 30 minutes). If it doesn't, the aircraft was probably swapped and
 *   the rotation is reported as unknown.
 * - Consecutive legs must connect: the previous leg arrives at the airport the next one leaves
 *   from, and the scheduled ground time is between 15 minutes and 12 hours. Any gap stops the chain.
 * - All times are UTC instants, so midnight crossings and time zones need no special handling;
 *   local dates are only used to name a dated flight.
 */

export type LegStatus = "scheduled" | "in_air" | "landed" | "cancelled" | "diverted" | "unknown";

export type AircraftLeg = {
  flightNumber: string;
  /** Local departure date at origin (YYYY-MM-DD). */
  date: string;
  origin: string;
  destination: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  estimatedDeparture?: Date | null;
  estimatedArrival?: Date | null;
  actualDeparture?: Date | null;
  actualArrival?: Date | null;
  status: LegStatus;
  registration: string | null;
  aircraftModel?: string | null;
  source: string;
  /** When the provider data was fetched. */
  observedAt: Date;
};

export type AssignmentConfidence = "confirmed" | "planned" | "unknown";

export type RotationLink = {
  from: AircraftLeg;
  to: AircraftLeg;
  airport: string;
  scheduledGroundMin: number;
};

export type RotationResult = {
  registration: string | null;
  aircraftModel: string | null;
  confidence: AssignmentConfidence;
  /** Why the rotation is (or isn't) known, in plain language. */
  reasons: string[];
  incoming: AircraftLeg | null;
  target: AircraftLeg | null;
  subsequent: AircraftLeg[];
  links: RotationLink[];
  source: string | null;
  observedAt: string | null;
  swap: { previous: string; current: string } | null;
};

export const MIN_GROUND_MIN = 15;
export const MAX_GROUND_MIN = 12 * 60;
const MATCH_TOLERANCE_MIN = 30;

export type TargetFlight = {
  flightNumber: string;
  origin: string;
  destination: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
};

function mins(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / 60_000;
}

function sameFlight(leg: AircraftLeg, t: TargetFlight) {
  return (
    normalizeFlight(leg.flightNumber) === normalizeFlight(t.flightNumber) &&
    leg.origin === t.origin &&
    Math.abs(mins(leg.scheduledDeparture, t.scheduledDeparture)) <= MATCH_TOLERANCE_MIN
  );
}

export function normalizeFlight(f: string) {
  return f.replace(/\s+/g, "").toUpperCase().replace(/^([A-Z0-9]{2})0+(\d)/, "$1$2");
}

function connects(a: AircraftLeg, b: AircraftLeg) {
  const ground = mins(a.scheduledArrival, b.scheduledDeparture);
  return a.destination === b.origin && ground >= MIN_GROUND_MIN && ground <= MAX_GROUND_MIN && a.status !== "cancelled" && b.status !== "cancelled";
}

export function unknownRotation(reason: string, extra: Partial<RotationResult> = {}): RotationResult {
  return {
    registration: null,
    aircraftModel: null,
    confidence: "unknown",
    reasons: [reason],
    incoming: null,
    target: null,
    subsequent: [],
    links: [],
    source: null,
    observedAt: null,
    swap: null,
    ...extra,
  };
}

/**
 * @param registration the aircraft currently assigned to your flight, if a provider gave one
 * @param legs every leg the provider lists for that registration around your flight's date
 * @param opts.previousRegistration the registration seen at an earlier check, to detect swaps
 * @param opts.maxSubsequent how many later legs to follow (default 3)
 */
export function resolveRotation(
  target: TargetFlight,
  registration: string | null,
  legs: AircraftLeg[],
  opts: { now: Date; previousRegistration?: string | null; maxSubsequent?: number; registrationSource?: string | null } ,
): RotationResult {
  const swap =
    opts.previousRegistration && registration && opts.previousRegistration !== registration
      ? { previous: opts.previousRegistration, current: registration }
      : null;
  if (!registration) {
    return unknownRotation("No data source has assigned an aircraft to this flight yet, so the incoming flight is unknown.", { swap });
  }
  const own = legs.filter((l) => l.registration === registration).sort((a, b) => a.scheduledDeparture.getTime() - b.scheduledDeparture.getTime());
  const idx = own.findIndex((l) => sameFlight(l, target));
  if (idx === -1) {
    return unknownRotation(
      `Aircraft ${registration} is not listed on this flight in the latest schedule data. The aircraft may have been changed, so ClaimWing does not link any flights.`,
      { registration, swap, source: own[0]?.source ?? null, observedAt: own[0]?.observedAt.toISOString() ?? null },
    );
  }
  const reasons: string[] = [];
  const tLeg = own[idx];
  const links: RotationLink[] = [];

  let incoming: AircraftLeg | null = null;
  const prev = own[idx - 1];
  if (prev && connects(prev, tLeg)) {
    incoming = prev;
    links.push({ from: prev, to: tLeg, airport: tLeg.origin, scheduledGroundMin: Math.round(mins(prev.scheduledArrival, tLeg.scheduledDeparture)) });
  } else if (prev) {
    reasons.push(
      prev.destination !== tLeg.origin
        ? `The previous leg listed for ${registration} ends at ${prev.destination}, not ${tLeg.origin}, so the incoming flight can't be confirmed.`
        : `The gap between ${prev.flightNumber} and your flight is outside the 15 minute to 12 hour range used to link flights.`,
    );
  } else {
    reasons.push(`No earlier leg is listed for ${registration}. It may be the aircraft's first flight of the day.`);
  }

  const subsequent: AircraftLeg[] = [];
  let cur = tLeg;
  for (let i = idx + 1; i < own.length && subsequent.length < (opts.maxSubsequent ?? 3); i++) {
    if (!connects(cur, own[i])) break;
    links.push({ from: cur, to: own[i], airport: own[i].origin, scheduledGroundMin: Math.round(mins(cur.scheduledArrival, own[i].scheduledDeparture)) });
    subsequent.push(own[i]);
    cur = own[i];
  }

  // Assignments made long before departure often change.
  const hoursOut = mins(opts.now, tLeg.scheduledDeparture) / 60;
  const confidence: AssignmentConfidence = hoursOut > 6 ? "planned" : "confirmed";
  if (confidence === "planned") reasons.push("The aircraft assignment is the airline's current plan and often changes in the last hours before departure.");
  if (swap) reasons.push(`The aircraft changed from ${swap.previous} to ${swap.current}. Earlier links were dropped and the rotation was rebuilt.`);

  return {
    registration,
    aircraftModel: tLeg.aircraftModel ?? null,
    confidence,
    reasons,
    incoming,
    target: tLeg,
    subsequent,
    links,
    source: tLeg.source,
    observedAt: tLeg.observedAt.toISOString(),
    swap,
  };
}
