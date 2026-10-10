import { HttpError, notFound, ok, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { loadReplay } from "@/lib/providers/replay";
import { FlightOutcome, FlightSnapshot, Notification, Trip } from "@/models";

/** Restarts a demo replay from the beginning. Only demo trips can be replayed. */
export const POST = withUser<{ id: string }>(async (_req, { params, user }) => {
  await connectDB();
  const trip = await Trip.findOne({ _id: params.id, userId: user.oid });
  if (!trip) throw notFound("Trip not found");
  if (!trip.demoMode || !trip.replay?.file) throw new HttpError(400, "Only demo trips can be replayed.");
  const r = await loadReplay(trip.replay.file);
  const now = new Date();
  const dep = new Date(now.getTime() - (r.gateDepartureMin - 10) * 60_000);
  trip.scheduledDeparture = dep;
  trip.scheduledArrival = new Date(dep.getTime() + r.scheduledDurationMin * 60_000);
  trip.set("replay.startedAt", now);
  trip.set("tracking", { status: "scheduled", icao24: r.icao24, callsign: r.callsign, icao24Source: "Demo replay" });
  await Promise.all([
    trip.save(),
    FlightSnapshot.deleteMany({ tripId: trip._id, userId: user.oid }),
    FlightOutcome.deleteOne({ tripId: trip._id, userId: user.oid }),
    Notification.deleteMany({ userId: user.oid, dedupeKey: { $regex: `:${trip._id}$` } }),
  ]);
  return ok({ ok: true });
});
