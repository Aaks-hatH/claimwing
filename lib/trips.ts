import "server-only";
import type { Types } from "mongoose";
import { DateTime } from "luxon";
import { HttpError } from "./errors";
import { canonicalCarrier, getAirline, getAirport } from "./reference";
import { parseFlightNumber } from "./flight-number";
import { localToUtc } from "./time";
import { tripInput } from "./validation";
import type { z } from "zod";
import { loadReplay } from "./providers/replay";
import { Trip } from "@/models";

/** Turns validated form input into stored trip fields (UTC times computed from each airport's zone). */
export function tripFieldsFromInput(input: z.output<typeof tripInput>) {
  const origin = getAirport(input.origin);
  const destination = getAirport(input.destination);
  if (!origin) throw new HttpError(400, `We don't know airport ${input.origin}.`, { field: "origin" });
  if (!destination) throw new HttpError(400, `We don't know airport ${input.destination}.`, { field: "destination" });
  const dep = localToUtc(input.flightDate, input.departureTime, origin.tz);
  const arr = localToUtc(input.arrivalDate, input.arrivalTime, destination.tz);
  if (!dep || !arr) throw new HttpError(400, "Those dates and times aren't valid.");
  const hours = (arr.getTime() - dep.getTime()) / 3600_000;
  if (hours <= 0) throw new HttpError(400, "Arrival must be after departure (times are local to each airport).", { field: "arrivalTime" });
  if (hours > 22) throw new HttpError(400, "That flight would last over 22 hours. Check the arrival date and time.", { field: "arrivalDate" });
  // One parser for both forms ("117" with the airline field, or "BA117" / "GEC8225" on its own).
  const parsed = parseFlightNumber(input.flightNumber, input.airline);
  if (!parsed.ok) throw new HttpError(400, parsed.message, { field: "flightNumber" });
  // BA and BAW are the same airline, so compare and store the IATA form whenever we know it.
  const airline = canonicalCarrier(input.airline);
  if (canonicalCarrier(parsed.carrier) !== airline) {
    throw new HttpError(400, `Flight ${parsed.flightNumber} doesn't match airline ${input.airline}. Check the airline and the flight number.`, { field: "flightNumber" });
  }
  const flightNumber = `${airline}${parsed.number}`;
  return {
    airline,
    airlineName: getAirline(airline)?.name ?? airline,
    flightNumber,
    flightDate: input.flightDate,
    origin: origin.iata,
    destination: destination.iata,
    scheduledDeparture: dep,
    scheduledArrival: arr,
    passengerName: input.passengerName,
    bookingRef: input.bookingRef || undefined,
    ticketPrice: input.ticketPrice ?? undefined,
    operatingCarrierRegion: input.operatingCarrierRegion,
  };
}

export const DEMO_REPLAY = "sample-ba117-lhr-jfk.json";

/** Creates a trip that replays a stored flight. Clearly labelled as a demo everywhere. */
export async function createDemoTrip(userId: Types.ObjectId, passengerName: string, speed = 90) {
  const r = await loadReplay(DEMO_REPLAY);
  const origin = getAirport(r.origin)!;
  const now = new Date();
  // Start the replay ten minutes before pushback, with the clock aligned to now.
  const scheduledDeparture = new Date(now.getTime() - (r.gateDepartureMin - 10) * 60_000);
  const scheduledArrival = new Date(scheduledDeparture.getTime() + r.scheduledDurationMin * 60_000);
  const local = DateTime.fromJSDate(scheduledDeparture).setZone(origin.tz ?? "UTC");
  return Trip.create({
    userId,
    airline: r.flightNumber.slice(0, 2),
    airlineName: getAirline(r.flightNumber.slice(0, 2))?.name,
    flightNumber: r.flightNumber,
    flightDate: local.toFormat("yyyy-LL-dd"),
    origin: r.origin,
    destination: r.destination,
    scheduledDeparture,
    scheduledArrival,
    passengerName,
    bookingRef: "DEMO01",
    ticketPrice: { amount: 640, currency: "GBP" },
    demoMode: true,
    replay: { file: DEMO_REPLAY, startedAt: now, speed },
    tracking: { status: "scheduled", icao24: r.icao24, callsign: r.callsign, icao24Source: "Demo replay" },
  });
}
