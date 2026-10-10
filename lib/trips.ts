import "server-only";
import type { Types } from "mongoose";
import { DateTime } from "luxon";
import { HttpError } from "./errors";
import { getAirline, getAirport } from "./reference";
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
  const number = input.flightNumber.replace(/\s+/g, "");
  let flightNumber: string;
  if (/^\d{1,4}[A-Z]?$/.test(number)) {
    flightNumber = `${input.airline}${number.replace(/^0+(?=\d)/, "")}`;
  } else {
    const m = number.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
    if (!m) throw new HttpError(400, "Enter the flight number, for example 117 or BA117.", { field: "flightNumber" });
    if (m[1] !== input.airline) throw new HttpError(400, `Flight ${number} doesn't match airline ${input.airline}.`, { field: "flightNumber" });
    flightNumber = `${m[1]}${m[2].replace(/^0+(?=\d)/, "")}`;
  }
  return {
    airline: input.airline,
    airlineName: getAirline(input.airline)?.name ?? input.airline,
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
