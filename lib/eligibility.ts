import "server-only";
import { getAirline, getAirport } from "./reference";
import { evaluateBaggage, evaluateFlight, type FlightEligibility, type BaggageEligibility, type DelayEvidenceKind } from "./rules/engine";
import type { CauseKey } from "./rules/config";
import type { BaggageDoc, OutcomeDoc, TripDoc } from "@/models";

export type Sdr = { rate: number; currency: string };

type TripLike = Pick<TripDoc, "origin" | "destination" | "airline" | "operatingCarrierRegion" | "ticketPrice" | "scheduledArrival">;
type OutcomeLike = Partial<
  Pick<OutcomeDoc, "disruption" | "delayMinutes" | "delayKind" | "cause" | "cancellationNoticeDays" | "reroutingOffered" | "deniedBoardingVoluntary" | "actualArrival">
> | null;

export function flightEligibility(trip: TripLike, outcome: OutcomeLike): FlightEligibility | null {
  const o = getAirport(trip.origin);
  const d = getAirport(trip.destination);
  if (!o || !d) return null;
  const airline = getAirline(trip.airline);
  return evaluateFlight({
    origin: { iata: o.iata, country: o.country, lat: o.lat, lon: o.lon },
    destination: { iata: d.iata, country: d.country, lat: d.lat, lon: d.lon },
    airlineCountry: airline?.country ?? null,
    operatingCarrierRegion: (trip.operatingCarrierRegion as "auto" | "eu" | "uk" | "other") ?? "auto",
    disruption: (outcome?.disruption as "delay" | "cancellation" | "denied_boarding" | "none") ?? "delay",
    arrivalDelayMinutes: outcome?.delayMinutes ?? null,
    delayEvidenceKind: (outcome?.delayKind as DelayEvidenceKind) ?? null,
    cancellationNoticeDays: outcome?.cancellationNoticeDays ?? null,
    reroutingOffered: outcome?.reroutingOffered ?? null,
    deniedBoardingVoluntary: outcome?.deniedBoardingVoluntary ?? null,
    cause: (outcome?.cause as CauseKey) ?? "unknown",
    ticketPrice:
      trip.ticketPrice?.amount != null ? { amount: trip.ticketPrice.amount, currency: trip.ticketPrice.currency ?? "USD" } : null,
  });
}

export function baggageEligibility(
  bag: Pick<BaggageDoc, "status" | "receivedAt" | "reportedMissingAt" | "deliveredAt" | "estimatedValue">,
  trip: TripLike,
  outcome: OutcomeLike,
  sdr: Sdr,
): BaggageEligibility | null {
  const o = getAirport(trip.origin);
  const d = getAirport(trip.destination);
  if (!o || !d) return null;
  return evaluateBaggage({
    status: bag.status as "documented" | "received_ok" | "arrived_damaged" | "delayed" | "lost",
    receivedAt: bag.receivedAt ?? null,
    reportedMissingAt: bag.reportedMissingAt ?? null,
    deliveredAt: bag.deliveredAt ?? null,
    arrivalDate: outcome?.actualArrival ?? trip.scheduledArrival,
    estimatedValue:
      bag.estimatedValue?.amount != null ? { amount: bag.estimatedValue.amount, currency: bag.estimatedValue.currency ?? "USD" } : null,
    sdrRate: sdr.rate,
    sdrCurrency: sdr.currency,
    originCountry: o.country,
    destinationCountry: d.country,
  });
}
