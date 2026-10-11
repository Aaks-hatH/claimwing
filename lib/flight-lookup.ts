import "server-only";
import { DateTime } from "luxon";
import { env } from "@/lib/env";
import { parseFlightNumber, type FlightNumberParts } from "@/lib/flight-number";
import { cached } from "@/lib/providers/cache";
import { scheduleProvider } from "@/lib/providers/schedule";
import type { ScheduleInfo } from "@/lib/providers/types";
import { findAirline, getAirport, scheduleQueryCandidates } from "@/lib/reference";
import { utcToLocalParts } from "@/lib/time";

/**
 * Flight lookup used by signup and the trip forms.
 *
 * Every outcome carries a `status` so the UI can say what actually happened instead of one generic
 * "enter a flight number" message:
 *   invalid_format      the text is not shaped like a flight number (nothing was looked up)
 *   invalid_date        the date is not a real calendar date
 *   not_configured      this server has no schedule provider
 *   service_unavailable the provider failed or timed out: the flight is neither confirmed nor ruled out
 *   not_found           the provider answered and has no such flight on that date
 *   incomplete_data     the provider knows the flight but not its times or airports
 *   ok                  one or more matching legs, for the traveller to choose from
 */
export type LookupStatus = "ok" | "invalid_format" | "invalid_date" | "not_configured" | "service_unavailable" | "not_found" | "incomplete_data";

export type LookupInput = { flight: FlightNumberParts; date: string };

export type LookupOutcome = { httpStatus: number; body: Record<string, unknown> & { status: LookupStatus; message?: string } };

const FOUND_TTL = 6 * 3600;
/** "Nothing found" is cached briefly: schedules are often published late, so it must not stick for hours. */
const EMPTY_TTL = 5 * 60;

export function parseLookupInput(rawFlight: unknown, rawDate: unknown): { ok: true; input: LookupInput } | { ok: false; outcome: LookupOutcome } {
  const flight = parseFlightNumber(rawFlight);
  if (!flight.ok) {
    return { ok: false, outcome: { httpStatus: 400, body: { found: false, status: "invalid_format", error: flight.message, message: flight.message } } };
  }
  const date = typeof rawDate === "string" ? rawDate.trim() : "";
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? DateTime.fromISO(date, { zone: "utc" }) : null;
  if (!dt?.isValid) {
    const message = "Choose a valid departure date.";
    return { ok: false, outcome: { httpStatus: 400, body: { found: false, status: "invalid_date", error: message, message } } };
  }
  return { ok: true, input: { flight, date } };
}

async function legsFor(providerName: string, candidate: string, date: string, load: () => Promise<ScheduleInfo[]>): Promise<ScheduleInfo[]> {
  return cached(`lookup-options:${providerName}:${candidate}:${date}`, (v: ScheduleInfo[]) => (v.length ? FOUND_TTL : EMPTY_TTL), load);
}

export async function lookupFlight({ flight, date }: LookupInput): Promise<LookupOutcome> {
  const airline = findAirline(flight.carrier);
  const label = flight.flightNumber;
  const identity = {
    airline: airline?.iata ?? flight.carrier,
    number: flight.number,
    flightNumber: label,
    airlineName: airline?.name ?? null,
    airlineKnown: Boolean(airline),
  };

  const p = scheduleProvider();
  if (!p?.getSchedule) {
    return {
      httpStatus: 200,
      body: { found: false, configured: false, status: "not_configured", flight: identity, message: "Automatic lookup isn't set up on this server, so we haven't checked this flight. Enter the times from your booking." },
    };
  }
  const provider = p;

  let legs: ScheduleInfo[] = [];
  let failure: unknown = null;
  for (const candidate of scheduleQueryCandidates(label)) {
    try {
      const got = await legsFor(provider.name, candidate, date, async () =>
        provider.getScheduleOptions ? provider.getScheduleOptions(candidate, date) : [await provider.getSchedule!(candidate, date)].filter((x): x is ScheduleInfo => x !== null),
      );
      if (got.length) {
        legs = got;
        failure = null;
        break;
      }
    } catch (e) {
      failure = e;
      console.warn("[flight-lookup] provider failed", provider.name, candidate, e instanceof Error ? e.message : e);
    }
  }

  if (!legs.length && failure) {
    return {
      httpStatus: 200,
      body: {
        found: false,
        configured: true,
        status: "service_unavailable",
        retryable: true,
        flight: identity,
        message: `Our flight schedule service isn't responding, so we couldn't check ${label} just now. Your flight number looks fine. Try again in a minute, or enter the details from your booking.`,
      },
    };
  }

  if (!legs.length) {
    const unknownAirline = airline
      ? ""
      : ` We also don't recognise the airline code ${flight.carrier}. If your booking shows a 2-character code for this airline, try that instead.`;
    return {
      httpStatus: 200,
      body: {
        found: false,
        configured: true,
        status: "not_found",
        flight: identity,
        message: `We couldn't find ${label} on ${date} in our schedule data. Check the date, or enter the details from your booking.${unknownAirline}`,
      },
    };
  }

  const options = legs
    .filter((info) => info && info.scheduledDeparture && info.scheduledArrival && info.origin && info.destination)
    .map((info) => {
      const o = getAirport(info.origin!);
      const d = getAirport(info.destination!);
      const dep = utcToLocalParts(info.scheduledDeparture!, o?.tz);
      const arr = utcToLocalParts(info.scheduledArrival!, d?.tz);
      return {
        origin: info.origin!,
        destination: info.destination!,
        originCity: o?.city ?? null,
        destinationCity: d?.city ?? null,
        flightDate: dep.date,
        departureTime: dep.time,
        arrivalDate: arr.date,
        arrivalTime: arr.time,
        icao24: info.icao24,
        status: info.status,
        source: info.source,
        notes: info.notes ?? [],
        sortKey: new Date(info.scheduledDeparture!).getTime(),
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((leg) => {
      const { sortKey, ...rest } = leg;
      void sortKey;
      return rest;
    });

  if (!options.length) {
    return {
      httpStatus: 200,
      body: {
        found: false,
        configured: true,
        status: "incomplete_data",
        flight: identity,
        message: `${label} is in the schedule, but without usable times or airports. Enter the details from your booking.`,
      },
    };
  }

  // The user always picks their flight and day. We never guess when there is more than one.
  return { httpStatus: 200, body: { found: true, configured: true, status: "ok", flight: identity, requestedDate: date, options, provider: env.scheduleProvider() } };
}
