/**
 * Eligibility engine. Pure functions only: no I/O, no clock unless passed in,
 * so results are reproducible and unit-tested (tests/eligibility.test.ts).
 *
 * The engine never promises an outcome. It returns "eligible", "not_eligible"
 * or "needs_review" with the rule it applied and a plain-English explanation.
 */
import {
  CAUSES,
  EU261,
  MONTREAL,
  THRESHOLD_UNCERTAINTY_MINUTES,
  UK261,
  US_DOT,
  type CauseKey,
  type CompensationRegime,
} from "./config";
import { greatCircleKm } from "./geo";
import { carrierRegionFromCountry, EU261_TERRITORY, UK261_TERRITORY, US_TERRITORY, type CarrierRegion } from "./regions";

export type EligibilityStatus = "eligible" | "not_eligible" | "needs_review";

export type AirportInput = { iata: string; country: string; lat: number; lon: number };

export type DelayEvidenceKind =
  | "gate_arrival"
  | "manual_arrival"
  | "runway_arrival"
  | "adsb_on_ground"
  | "adsb_last_contact"
  | "estimated_arrival"
  | null;

export type FlightInput = {
  origin: AirportInput;
  destination: AirportInput;
  /** ISO country of the airline (from its code) */
  airlineCountry: string | null;
  /** User override for who operated the flight. */
  operatingCarrierRegion?: "auto" | CarrierRegion;
  disruption: "delay" | "cancellation" | "denied_boarding" | "none";
  arrivalDelayMinutes: number | null;
  delayEvidenceKind?: DelayEvidenceKind;
  cancellationNoticeDays?: number | null;
  reroutingOffered?: boolean | null;
  deniedBoardingVoluntary?: boolean | null;
  cause: CauseKey;
  ticketPrice?: { amount: number; currency: string } | null;
};

export type Citation = { label: string; url?: string };

export type RegimeResult = {
  regime: "EU261" | "UK261" | "US_DOT";
  regimeName: string;
  applies: boolean;
  coverage: string;
  status: EligibilityStatus;
  /** Headline amount (the full amount where a reduction is possible). */
  amount: number | null;
  /** Lowest amount the airline may lawfully pay, when a reduction can apply. */
  minAmount: number | null;
  currency: string | null;
  kind: "compensation" | "refund" | "none";
  ruleApplied: string;
  explanation: string[];
  citations: Citation[];
};

export type FlightEligibility = {
  distanceKm: number;
  carrierRegion: CarrierRegion;
  results: RegimeResult[];
  primary: RegimeResult | null;
  summary: string;
  disclaimer: string;
};

const DISCLAIMER =
  "This is an automated estimate based on the facts you stored, not legal advice. The airline or a court may reach a different conclusion.";

function money(amount: number, currency: string) {
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "USD" ? "$" : "";
  return symbol ? `${symbol}${amount.toLocaleString("en")}` : `${amount.toLocaleString("en")} ${currency}`;
}

export function bandFor(regime: CompensationRegime, distanceKm: number, intra: boolean) {
  const band = regime.bands.find((b) => distanceKm <= b.maxKm) ?? regime.bands[regime.bands.length - 1];
  if (intra && distanceKm > regime.bands[0].maxKm) {
    return { amount: regime.intraTerritoryLongAmount, label: `over 1,500 km within the territory` };
  }
  return { amount: band.amount, label: band.label };
}

function coverageFor(
  regime: CompensationRegime,
  origin: AirportInput,
  destination: AirportInput,
  carrier: CarrierRegion,
): { applies: boolean; reason: string; intra: boolean } {
  const territory = regime.id === "EU261" ? EU261_TERRITORY : UK261_TERRITORY;
  const depIn = territory.has(origin.country);
  const arrIn = territory.has(destination.country);
  const place = regime.id === "EU261" ? "the EU, EEA or Switzerland" : "the UK";
  if (depIn) {
    return { applies: true, reason: `The flight departed from ${origin.iata} in ${place}, so ${regime.id} applies to any airline.`, intra: arrIn };
  }
  const qualifyingCarrier = regime.id === "EU261" ? carrier === "eu" : carrier === "uk" || carrier === "eu";
  if (arrIn && qualifyingCarrier) {
    const who = regime.id === "EU261" ? "an EU, EEA or Swiss airline" : "a UK or EU airline";
    return {
      applies: true,
      reason: `The flight arrived in ${place} and was operated by ${who}.`,
      intra: false,
    };
  }
  if (arrIn) {
    return {
      applies: false,
      reason: `The flight arrived in ${place} but departed from outside it on an airline that does not qualify, so ${regime.id} does not apply.`,
      intra: false,
    };
  }
  return { applies: false, reason: `The flight neither departed from nor arrived in ${place}.`, intra: false };
}

function evaluateCompensationRegime(
  regime: CompensationRegime,
  input: FlightInput,
  distanceKm: number,
  carrier: CarrierRegion,
): RegimeResult {
  const cov = coverageFor(regime, input.origin, input.destination, carrier);
  const citations: Citation[] = [{ label: regime.citation, url: regime.url }];
  const base = {
    regime: regime.id,
    regimeName: regime.name,
    applies: cov.applies,
    coverage: cov.reason,
    currency: regime.currency,
    citations,
  } as const;

  if (!cov.applies) {
    return {
      ...base,
      status: "not_eligible",
      amount: null,
      minAmount: null,
      kind: "none",
      ruleApplied: "Scope (Article 3)",
      explanation: [cov.reason],
    };
  }

  const band = bandFor(regime, distanceKm, cov.intra);
  const full = band.amount;
  const explanation: string[] = [cov.reason];
  const distanceText = `${Math.round(distanceKm).toLocaleString("en")} km great-circle distance (${band.label}).`;
  const cause = CAUSES[input.cause] ?? CAUSES.unknown;

  const withCause = (status: EligibilityStatus, rule: string, amount: number, minAmount: number | null): RegimeResult => {
    let finalStatus = status;
    if (status === "eligible" && cause.extraordinary !== "no") {
      finalStatus = "needs_review";
      explanation.push(
        cause.extraordinary === "likely"
          ? `Reported cause: ${cause.label.toLowerCase()}. This is likely an extraordinary circumstance, which would mean no compensation. ${cause.explanation}`
          : `Reported cause: ${cause.label.toLowerCase()}. ${cause.explanation}`,
      );
      citations.push({ label: "Article 5(3) and Recital 14 (extraordinary circumstances)" });
    } else if (status === "eligible") {
      explanation.push(cause.explanation);
    }
    return {
      ...base,
      status: finalStatus,
      amount,
      minAmount,
      kind: "compensation",
      ruleApplied: rule,
      explanation,
    };
  };

  /* ---- Denied boarding (Article 4) ---- */
  if (input.disruption === "denied_boarding") {
    if (input.deniedBoardingVoluntary) {
      explanation.push("You volunteered to give up your seat, so the benefits you agreed with the airline replace compensation (Article 4(1)).");
      return { ...base, status: "not_eligible", amount: null, minAmount: null, kind: "none", ruleApplied: "Article 4(1)", explanation };
    }
    explanation.push(
      `You were denied boarding against your will. Compensation is ${money(full, regime.currency)} for ${distanceText}`,
      "Airlines can refuse boarding for reasonable grounds such as health, safety, security or missing travel documents; in those cases nothing is owed.",
    );
    return { ...base, status: "eligible", amount: full, minAmount: null, kind: "compensation", ruleApplied: "Article 4(3) with Article 7", explanation };
  }

  /* ---- Cancellation (Article 5) ---- */
  if (input.disruption === "cancellation") {
    const notice = input.cancellationNoticeDays;
    if (notice === null || notice === undefined) {
      explanation.push("Tell us how many days before departure the airline informed you of the cancellation.");
      return { ...base, status: "needs_review", amount: full, minAmount: null, kind: "compensation", ruleApplied: "Article 5(1)(c)", explanation };
    }
    if (notice >= regime.cancellationNoticeDays) {
      explanation.push(`You were told ${notice} days before departure. Cancellations announced at least ${regime.cancellationNoticeDays} days ahead do not attract compensation.`);
      return { ...base, status: "not_eligible", amount: null, minAmount: null, kind: "none", ruleApplied: "Article 5(1)(c)(i)", explanation };
    }
    explanation.push(`You were told ${notice} day${notice === 1 ? "" : "s"} before departure (less than ${regime.cancellationNoticeDays}). ${distanceText}`);
    if (input.reroutingOffered) {
      explanation.push(
        "You were offered another flight. Compensation then depends on how close its times were to your original flight (Article 5(1)(c)(ii) and (iii)), so this needs review.",
      );
      return { ...base, status: "needs_review", amount: full, minAmount: null, kind: "compensation", ruleApplied: "Article 5(1)(c)(ii)–(iii) with Article 7", explanation };
    }
    return withCause("eligible", "Article 5(1)(c) with Article 7", full, null);
  }

  /* ---- No disruption ---- */
  if (input.disruption === "none") {
    explanation.push("No disruption is recorded for this flight.");
    return { ...base, status: "not_eligible", amount: null, minAmount: null, kind: "none", ruleApplied: "None", explanation };
  }

  /* ---- Delay at final destination (Article 7 as interpreted in Sturgeon) ---- */
  const delay = input.arrivalDelayMinutes;
  if (delay === null || delay === undefined) {
    explanation.push("We don't have an actual arrival time yet, so the delay can't be calculated.");
    return { ...base, status: "needs_review", amount: null, minAmount: null, kind: "compensation", ruleApplied: "Article 7 (Sturgeon, C-402/07)", explanation };
  }

  const threshold = regime.delayThresholdMinutes;
  const kind = input.delayEvidenceKind ?? null;
  const preciseKind = kind === "gate_arrival" || kind === "manual_arrival";
  const thresholdText = `${threshold / 60} hours`;
  citations.push({ label: "Sturgeon v Condor (C-402/07, C-432/07): delays of 3 hours or more at arrival" });

  if (!preciseKind) {
    // Runway and ADS-B times come before the doors open (Germanwings, C-452/13). Don't decide close calls.
    const lo = threshold - THRESHOLD_UNCERTAINTY_MINUTES.below;
    const hi = threshold + THRESHOLD_UNCERTAINTY_MINUTES.above;
    if (delay >= lo && delay < hi) {
      explanation.push(
        `The measured delay is ${delay} minutes, close to the ${thresholdText} threshold. Legally the arrival time is when a door opens (Germanwings, C-452/13), but this time comes from ${describeKind(kind)}, which is usually a few minutes earlier. Check the gate arrival time before claiming.`,
      );
      citations.push({ label: "Germanwings v Henning (C-452/13): arrival time is when the doors open" });
      return { ...base, status: "needs_review", amount: full, minAmount: null, kind: "compensation", ruleApplied: "Article 7 (threshold check)", explanation };
    }
  }

  if (delay < threshold) {
    explanation.push(
      `Arrival delay was ${formatMinutes(delay)}, below the ${thresholdText} needed for compensation. You may still have had rights to meals and care during the wait (Article 9).`,
    );
    return { ...base, status: "not_eligible", amount: null, minAmount: null, kind: "none", ruleApplied: "Article 7 (Sturgeon threshold)", explanation };
  }

  explanation.push(`Arrival delay was ${formatMinutes(delay)} at the final destination. ${distanceText}`);
  const red = regime.longHaulReduction;
  if (!cov.intra && distanceKm > red.minKm && delay < red.belowMinutes) {
    const min = Math.round(full * red.factor);
    explanation.push(
      `Because the flight is over ${red.minKm.toLocaleString("en")} km and the delay is under ${red.belowMinutes / 60} hours, the airline may reduce the payment by 50% to ${money(min, regime.currency)}.`,
    );
    citations.push({ label: red.citation });
    return withCause("eligible", "Article 7(1)(c) with 7(2)(c) reduction", full, min);
  }
  return withCause("eligible", "Article 7(1)", full, null);
}

function evaluateUs(input: FlightInput): RegimeResult {
  const depUs = US_TERRITORY.has(input.origin.country);
  const arrUs = US_TERRITORY.has(input.destination.country);
  const applies = depUs || arrUs;
  const domestic = depUs && arrUs;
  const citations: Citation[] = [{ label: US_DOT.refundCitation, url: US_DOT.refundUrl }];
  const base = {
    regime: "US_DOT" as const,
    regimeName: "US Department of Transportation rules",
    applies,
    coverage: applies
      ? `The flight ${depUs ? "departed from" : "arrived in"} the United States.`
      : "The flight did not touch the United States.",
    citations,
  };
  if (!applies) {
    return { ...base, status: "not_eligible", amount: null, minAmount: null, currency: null, kind: "none", ruleApplied: "None", explanation: [base.coverage] };
  }

  if (input.disruption === "denied_boarding") {
    const db = US_DOT.deniedBoarding;
    citations.push({ label: db.citation, url: db.url });
    if (input.deniedBoardingVoluntary) {
      return {
        ...base, status: "not_eligible", amount: null, minAmount: null, currency: "USD", kind: "none", ruleApplied: "14 CFR 250.2b",
        explanation: [base.coverage, "You volunteered, so the compensation you agreed with the airline applies instead."],
      };
    }
    const bands = domestic ? db.domesticBands : db.internationalBands;
    const delay = input.arrivalDelayMinutes;
    const fare = input.ticketPrice?.currency === "USD" ? input.ticketPrice.amount : null;
    const explanation = [base.coverage, "Involuntary denied boarding entitles you to compensation based on your one-way fare and how late you arrived."];
    if (delay === null || delay === undefined) {
      explanation.push("Add your actual arrival time to work out the amount.");
      return { ...base, status: "needs_review", amount: null, minAmount: null, currency: "USD", kind: "compensation", ruleApplied: "14 CFR 250.5", explanation };
    }
    if (delay < bands.lowMin) {
      explanation.push("You arrived within an hour of your original time, so no compensation is due.");
      return { ...base, status: "not_eligible", amount: null, minAmount: null, currency: "USD", kind: "none", ruleApplied: "14 CFR 250.5", explanation };
    }
    const high = delay >= bands.highMin;
    const multiple = high ? db.highMultiple : db.lowMultiple;
    const cap = high ? db.capsUsd.high : db.capsUsd.low;
    const amount = fare !== null ? Math.min(fare * multiple, cap) : cap;
    explanation.push(
      fare !== null
        ? `${multiple * 100}% of your one-way fare, capped at $${cap.toLocaleString("en")}. ${db.capsNote}`
        : `${multiple * 100}% of your one-way fare, up to $${cap.toLocaleString("en")}. Add your ticket price for an exact figure. ${db.capsNote}`,
    );
    return { ...base, status: fare !== null ? "eligible" : "needs_review", amount, minAmount: null, currency: "USD", kind: "compensation", ruleApplied: "14 CFR 250.5", explanation };
  }

  const threshold = domestic ? US_DOT.refundThresholdMinutes.domestic : US_DOT.refundThresholdMinutes.international;
  const explanation = [
    base.coverage,
    "US law does not require cash compensation for delays or cancellations.",
  ];
  const refundable =
    input.disruption === "cancellation" ||
    (input.disruption === "delay" && (input.arrivalDelayMinutes ?? 0) >= threshold);
  if (refundable) {
    explanation.push(
      input.disruption === "cancellation"
        ? "Because the flight was cancelled, you are owed a full refund if you chose not to travel or turned down the rebooking."
        : `The arrival was ${threshold / 60}+ hours late on a ${domestic ? "domestic" : "international"} flight, which counts as a significant change. If you chose not to travel or turned down the alternative, you are owed a refund.`,
      "If you flew the delayed flight or accepted rebooking, the refund right does not apply. Check your airline's customer service commitments for meals or hotels.",
    );
    const amount = input.ticketPrice?.currency === "USD" ? input.ticketPrice.amount : null;
    return { ...base, status: "needs_review", amount, minAmount: null, currency: "USD", kind: "refund", ruleApplied: "14 CFR 260.6", explanation };
  }
  explanation.push(`A refund applies only for cancellations or arrival changes of ${threshold / 60}+ hours on this kind of flight.`);
  return { ...base, status: "not_eligible", amount: null, minAmount: null, currency: "USD", kind: "none", ruleApplied: "14 CFR 260.2", explanation };
}

function describeKind(kind: DelayEvidenceKind) {
  switch (kind) {
    case "runway_arrival":
      return "the runway (touchdown) time";
    case "adsb_on_ground":
      return "aircraft position data (ADS-B) showing the plane on the ground";
    case "adsb_last_contact":
      return "the last aircraft position report (ADS-B) before landing";
    case "estimated_arrival":
      return "an estimated arrival time";
    default:
      return "a source other than the gate arrival time";
  }
}

function formatMinutes(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h ${r} min` : `${r} min`;
}

const statusRank: Record<EligibilityStatus, number> = { eligible: 0, needs_review: 1, not_eligible: 2 };

export function evaluateFlight(input: FlightInput): FlightEligibility {
  const distanceKm = greatCircleKm(input.origin, input.destination);
  const carrier: CarrierRegion =
    input.operatingCarrierRegion && input.operatingCarrierRegion !== "auto"
      ? input.operatingCarrierRegion
      : carrierRegionFromCountry(input.airlineCountry);

  const results = [
    evaluateCompensationRegime(EU261, input, distanceKm, carrier),
    evaluateCompensationRegime(UK261, input, distanceKm, carrier),
    evaluateUs(input),
  ];

  const applicable = results.filter((r) => r.applies);
  const compensation = applicable
    .filter((r) => r.kind === "compensation" || r.regime !== "US_DOT")
    .sort((a, b) => statusRank[a.status] - statusRank[b.status]);
  const primary = compensation[0] ?? applicable[0] ?? null;

  const both = results.filter((r) => r.applies && r.regime !== "US_DOT" && r.status !== "not_eligible");
  if (both.length > 1) {
    for (const r of both) {
      r.explanation.push("Both EU and UK rules cover this flight. You can only be compensated once, so claim under one of them.");
    }
  }

  let summary: string;
  if (!primary) summary = "No passenger rights regime we check (EU261, UK261, US DOT) covers this flight.";
  else if (primary.status === "eligible" && primary.amount !== null && primary.currency)
    summary = `Likely eligible for ${primary.minAmount ? `${money(primary.minAmount, primary.currency)}–` : ""}${money(primary.amount, primary.currency)} under ${primary.regime}.`;
  else if (primary.status === "needs_review")
    summary = `Possibly eligible under ${primary.regime}. Some facts need review before claiming.`;
  else summary = `Not eligible for compensation under ${primary.regime} based on the stored facts.`;

  return { distanceKm, carrierRegion: carrier, results, primary, summary, disclaimer: DISCLAIMER };
}

/* ======================= Baggage (Montreal Convention) ======================= */

export type BaggageInput = {
  status: "documented" | "received_ok" | "arrived_damaged" | "delayed" | "lost";
  receivedAt?: Date | string | null;
  reportedMissingAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  arrivalDate?: Date | string | null;
  estimatedValue?: { amount: number; currency: string } | null;
  sdrRate: number; // units of sdrCurrency per 1 SDR
  sdrCurrency: string;
  originCountry: string;
  destinationCountry: string;
};

export type Deadline = {
  kind: "damage_notice" | "delay_notice" | "deemed_lost" | "limitation";
  label: string;
  dueAt: string; // ISO
  basis: string;
  hard: boolean; // missing it can defeat the claim
};

export type BaggageEligibility = {
  status: EligibilityStatus;
  convention: "montreal" | "domestic";
  deadlines: Deadline[];
  limitSdr: number;
  limitLocal: number | null;
  limitCurrency: string | null;
  overLimit: boolean;
  explanation: string[];
  citations: Citation[];
};

const addDays = (d: Date | string, days: number) => new Date(new Date(d).getTime() + days * 86_400_000);

export function evaluateBaggage(input: BaggageInput): BaggageEligibility {
  const international = input.originCountry !== input.destinationCountry;
  const citations: Citation[] = [{ label: MONTREAL.citation, url: MONTREAL.url }];
  const explanation: string[] = [];
  const deadlines: Deadline[] = [];
  const limitLocal = input.sdrRate > 0 ? Math.round(MONTREAL.liabilityLimitSdr * input.sdrRate) : null;
  const currency = input.sdrCurrency;
  const overLimit = Boolean(limitLocal && input.estimatedValue && input.estimatedValue.currency === currency && input.estimatedValue.amount > limitLocal);

  if (!international) {
    explanation.push(
      "This is a domestic flight, so the Montreal Convention does not apply. National rules and the airline's conditions of carriage decide the limits and deadlines. Report the problem to the airline straight away.",
    );
  } else {
    explanation.push("International flights are usually covered by the Montreal Convention (both countries must be parties, which almost all are).");
  }

  let status: EligibilityStatus = "needs_review";

  if (input.status === "arrived_damaged") {
    if (input.receivedAt) {
      deadlines.push({
        kind: "damage_notice",
        label: "Written damage complaint to the airline",
        dueAt: addDays(input.receivedAt, MONTREAL.damageNoticeDays).toISOString(),
        basis: `Article 31(2): within ${MONTREAL.damageNoticeDays} days of receiving the bag`,
        hard: true,
      });
      status = international ? "eligible" : "needs_review";
      explanation.push(
        `Send a written complaint within ${MONTREAL.damageNoticeDays} days of receiving the bag. Your before and after photos show the damage appeared between check-in and arrival; they do not prove who caused it, and normal wear may be excluded.`,
      );
    } else {
      explanation.push("Mark when you received the bag to start the complaint deadline.");
    }
  } else if (input.status === "delayed") {
    if (input.deliveredAt) {
      deadlines.push({
        kind: "delay_notice",
        label: "Written delay claim to the airline",
        dueAt: addDays(input.deliveredAt, MONTREAL.delayNoticeDays).toISOString(),
        basis: `Article 31(2): within ${MONTREAL.delayNoticeDays} days of the bag being delivered`,
        hard: true,
      });
      status = international ? "eligible" : "needs_review";
      explanation.push("You can claim reasonable costs of essentials you had to buy while waiting. Keep the receipts.");
    } else if (input.reportedMissingAt) {
      deadlines.push({
        kind: "deemed_lost",
        label: "Bag can be treated as lost",
        dueAt: addDays(input.reportedMissingAt, MONTREAL.deemedLostAfterDays).toISOString(),
        basis: `Article 17(3): if the bag has not arrived within ${MONTREAL.deemedLostAfterDays} days`,
        hard: false,
      });
      explanation.push(
        "File a Property Irregularity Report (PIR) at the airport if you haven't. When the bag is delivered, mark it here: the 21-day written claim deadline starts then.",
      );
    }
  } else if (input.status === "lost") {
    status = international ? "eligible" : "needs_review";
    explanation.push("Claim the value of the bag and its contents, with receipts or other proof of value.");
  } else if (input.status === "received_ok") {
    status = "not_eligible";
    explanation.push("The bag arrived on time and undamaged.");
  } else {
    status = "not_eligible";
    explanation.push("Nothing has gone wrong with this bag yet. Your before photos are stored in case you need them.");
  }

  const limitationStart = input.arrivalDate ?? input.receivedAt ?? input.reportedMissingAt;
  if (limitationStart && status !== "not_eligible") {
    deadlines.push({
      kind: "limitation",
      label: "Last day to start a court claim",
      dueAt: addDays(limitationStart, 365 * MONTREAL.limitationYears).toISOString(),
      basis: `Article 35: ${MONTREAL.limitationYears} years from the date of arrival`,
      hard: true,
    });
  }

  if (overLimit) {
    explanation.push(
      `The value you entered is above the airline's liability limit of about ${limitLocal?.toLocaleString("en")} ${currency} (${MONTREAL.liabilityLimitSdr.toLocaleString("en")} SDR). You may not recover the difference unless you made a special declaration of value at check-in.`,
    );
  }
  explanation.push(MONTREAL.liabilityLimitNote);

  return {
    status,
    convention: international ? "montreal" : "domestic",
    deadlines,
    limitSdr: MONTREAL.liabilityLimitSdr,
    limitLocal,
    limitCurrency: currency,
    overLimit,
    explanation,
    citations,
  };
}
