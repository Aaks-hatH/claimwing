import { z } from "zod";
import { HttpError, ok, parseJson, withUser } from "@/lib/api";
import { env } from "@/lib/env";
import { connectDB } from "@/lib/db";
import { listTrips, tripView } from "@/lib/dal";
import { createDemoTrip, tripFieldsFromInput } from "@/lib/trips";
import { tripInput } from "@/lib/validation";
import { Trip } from "@/models";

export const GET = withUser(async (_req, { user }) => {
  return ok({ items: await listTrips(user.oid) });
});

const body = z.union([z.object({ demo: z.literal(true), speed: z.number().min(10).max(600).optional() }), tripInput]);

export const POST = withUser(
  async (req, { user }) => {
    const input = await parseJson(req, body);
    await connectDB();
    if ("demo" in input) {
      if (!env.demoMode()) throw new HttpError(403, "Demo replays are turned off on this server.");
      const trip = await createDemoTrip(user.oid, user.name, input.speed);
      return ok({ trip: tripView(trip.toObject()) }, { status: 201 });
    }
    const fields = tripFieldsFromInput(input);
    const trip = await Trip.create({
      ...fields,
      userId: user.oid,
      tracking: input.icao24 ? { status: "scheduled", icao24: input.icao24, icao24Source: "entered by you" } : { status: "scheduled" },
    });
    return ok({ trip: tripView(trip.toObject()) }, { status: 201 });
  },
  { rateLimit: { name: "trip-create", limit: 30, windowSeconds: 3600 } },
);
