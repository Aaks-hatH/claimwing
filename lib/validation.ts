import { z } from "zod";
import { FLIGHT_NUMBER_EXAMPLES, isAirlineCode, looksLikeFlightNumber } from "./flight-number";

/* Shared Zod schemas for forms (client) and route handlers (server). */

export const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter airport code");

export const airlineCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isAirlineCode, "Use the airline code: 2 characters (for example BA) or 3 letters (for example BAW)");

export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const localTime = z.string().regex(/^\d{2}:\d{2}$/, "Enter a time");

export const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");

const optionalMoney = z
  .object({ amount: z.number().nonnegative().max(1_000_000), currency })
  .nullable()
  .optional();

export const tripInput = z
  .object({
    airline: airlineCode,
    flightNumber: z
      .string()
      .trim()
      .toUpperCase()
      .refine(looksLikeFlightNumber, `Enter the flight number, for example 117 or ${FLIGHT_NUMBER_EXAMPLES}`),
    flightDate: localDate,
    origin: iata,
    destination: iata,
    departureTime: localTime,
    arrivalDate: localDate,
    arrivalTime: localTime,
    passengerName: z.string().trim().min(1, "Enter the passenger name").max(120),
    bookingRef: z.string().trim().max(20).optional().nullable(),
    ticketPrice: optionalMoney,
    operatingCarrierRegion: z.enum(["auto", "eu", "uk", "other"]).default("auto"),
    icao24: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[0-9a-f]{6}$/, "Transponder codes are 6 hex characters")
      .optional()
      .nullable()
      .or(z.literal("")),
  })
  .refine((v) => v.origin !== v.destination, { message: "Departure and arrival airports must differ", path: ["destination"] });

export type TripInput = z.input<typeof tripInput>;

export const outcomeInput = z.object({
  disruption: z.enum(["delay", "cancellation", "denied_boarding", "none"]).optional(),
  cause: z
    .enum(["unknown", "technical", "crew", "overbooking", "weather", "air_traffic_control", "security", "strike_airline", "strike_external", "other"])
    .optional(),
  causeNote: z.string().trim().max(1000).optional().nullable(),
  cancellationNoticeDays: z.number().int().min(0).max(365).optional().nullable(),
  reroutingOffered: z.boolean().optional().nullable(),
  deniedBoardingVoluntary: z.boolean().optional().nullable(),
  manualArrival: z.iso.datetime().optional().nullable(),
  manualDeparture: z.iso.datetime().optional().nullable(),
  manualNote: z.string().trim().max(300).optional().nullable(),
});

export const bagInput = z.object({
  description: z.string().trim().min(1, "Describe the bag").max(200),
  tagNumber: z.string().trim().max(20).optional().nullable(),
  contentsCategory: z.enum(["clothing", "electronics", "sports", "business", "baby", "medical", "mixed", "other"]).default("mixed"),
  estimatedValue: optionalMoney,
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const bagUpdate = bagInput.partial().extend({
  status: z.enum(["documented", "received_ok", "arrived_damaged", "delayed", "lost"]).optional(),
  receivedAt: z.iso.datetime().optional().nullable(),
  reportedMissingAt: z.iso.datetime().optional().nullable(),
  deliveredAt: z.iso.datetime().optional().nullable(),
  pirReference: z.string().trim().max(40).optional().nullable(),
});

export const rect = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.005).max(1),
  h: z.number().min(0.005).max(1),
});

export const ANGLE_ENUM = z.enum(["front", "back", "left", "right", "top", "bottom", "tag", "scale"]);
