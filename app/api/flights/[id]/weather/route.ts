import { notFound, ok, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { getAirport } from "@/lib/reference";
import { weatherAround } from "@/lib/weather";
import { FlightOutcome, Trip } from "@/models";

/** Fetches weather context at both airports around the scheduled times and stores it as cause evidence. */
export const POST = withUser<{ id: string }>(
  async (_req, { params, user }) => {
    await connectDB();
    const trip = await Trip.findOne({ _id: params.id, userId: user.oid }).lean();
    if (!trip) throw notFound("Trip not found");
    const o = getAirport(trip.origin);
    const d = getAirport(trip.destination);
    const [dep, arr] = await Promise.all([
      o ? weatherAround({ airport: o.iata, role: "departure", lat: o.lat, lon: o.lon, at: new Date(trip.scheduledDeparture) }).catch(() => null) : null,
      d ? weatherAround({ airport: d.iata, role: "arrival", lat: d.lat, lon: d.lon, at: new Date(trip.scheduledArrival) }).catch(() => null) : null,
    ]);
    const weather = { departure: dep, arrival: arr, fetchedAt: new Date().toISOString() };
    await FlightOutcome.updateOne(
      { tripId: trip._id, userId: user.oid },
      { $set: { "causeEvidence.weather": weather }, $setOnInsert: { tripId: trip._id, userId: user.oid } },
      { upsert: true },
    );
    return ok({ weather });
  },
  { rateLimit: { name: "weather", limit: 30, windowSeconds: 3600 } },
);
