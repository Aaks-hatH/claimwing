import { z } from "zod";
import { HttpError, ok, withUser } from "@/lib/api";
import { env } from "@/lib/env";
import { scheduleProvider } from "@/lib/providers/schedule";
import { cached } from "@/lib/providers/cache";
import { getAirport, splitFlightNumber } from "@/lib/reference";
import { utcToLocalParts } from "@/lib/time";

const q = z.object({
  flight: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Looks up a flight's schedule to pre-fill the new-trip form. Uses the shared cache to save quota. */
export const GET = withUser(
  async (req) => {
    const url = new URL(req.url);
    const parsed = q.safeParse({ flight: url.searchParams.get("flight"), date: url.searchParams.get("date") });
    if (!parsed.success) throw new HttpError(400, "Enter a flight number like BA117 and a date.");
    const p = scheduleProvider();
    if (!p?.getSchedule) {
      return ok({ found: false, configured: false, message: "Automatic lookup isn't set up on this server. Enter the times from your booking." });
    }
    const flight = parsed.data.flight.replace(/\s+/g, "");
    if (!splitFlightNumber(flight)) throw new HttpError(400, "Enter a flight number like BA117.");
    let info;
    try {
      info = await cached(`lookup:${p.name}:${flight}:${parsed.data.date}`, 6 * 3600, () => p.getSchedule!(flight, parsed.data.date));
    } catch (e) {
      return ok({ found: false, configured: true, message: `Lookup failed: ${e instanceof Error ? e.message : "unknown error"}. Enter the times from your booking.` });
    }
    if (!info || !info.scheduledDeparture || !info.scheduledArrival || !info.origin || !info.destination) {
      return ok({ found: false, configured: true, message: "We couldn't find that flight on that date. Check the number and date, or enter the details yourself." });
    }
    const o = getAirport(info.origin);
    const d = getAirport(info.destination);
    const dep = utcToLocalParts(info.scheduledDeparture, o?.tz);
    const arr = utcToLocalParts(info.scheduledArrival, d?.tz);
    return ok({
      found: true,
      configured: true,
      source: info.source,
      origin: info.origin,
      destination: info.destination,
      departureTime: dep.time,
      flightDate: dep.date,
      arrivalDate: arr.date,
      arrivalTime: arr.time,
      icao24: info.icao24,
      status: info.status,
      provider: env.scheduleProvider(),
    });
  },
  { rateLimit: { name: "flight-lookup", limit: 20, windowSeconds: 3600 } },
);
