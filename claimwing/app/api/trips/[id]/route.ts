import { HttpError, notFound, ok, parseJson, withUser } from "@/lib/api";
import { sdrOf } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { getTripBundle, tripView } from "@/lib/dal";
import { deleteTripCascade } from "@/lib/cascade";
import { tripFieldsFromInput } from "@/lib/trips";
import { tripInput } from "@/lib/validation";
import { FlightOutcome, FlightSnapshot, Trip } from "@/models";

type P = { id: string };

export const GET = withUser<P>(async (_req, { params, user }) => {
  const bundle = await getTripBundle(user.oid, params.id, sdrOf(user));
  if (!bundle) throw notFound("Trip not found");
  const { raw: _raw, ...rest } = bundle;
  void _raw;
  return ok(rest);
});

export const PATCH = withUser<P>(async (req, { params, user }) => {
  const input = await parseJson(req, tripInput);
  await connectDB();
  const trip = await Trip.findOne({ _id: params.id, userId: user.oid });
  if (!trip) throw notFound("Trip not found");
  if (trip.demoMode) throw new HttpError(400, "Demo trips can't be edited. Create a new trip instead.");
  const fields = tripFieldsFromInput(input);
  const flightChanged =
    fields.flightNumber !== trip.flightNumber ||
    fields.flightDate !== trip.flightDate ||
    fields.origin !== trip.origin ||
    fields.destination !== trip.destination ||
    +fields.scheduledDeparture !== +trip.scheduledDeparture ||
    +fields.scheduledArrival !== +trip.scheduledArrival;
  trip.set(fields);
  if (flightChanged) {
    // Different flight: start tracking from scratch but keep anything the user entered by hand.
    trip.set("tracking", { status: "scheduled", icao24: input.icao24 || undefined, icao24Source: input.icao24 ? "entered by you" : undefined });
    await FlightSnapshot.deleteMany({ tripId: trip._id, userId: user.oid });
    const outcome = await FlightOutcome.findOne({ tripId: trip._id, userId: user.oid });
    if (outcome) {
      outcome.evidence = outcome.evidence.filter((e) => e.kind.startsWith("manual_"));
      outcome.actualArrival = undefined;
      outcome.actualDeparture = undefined;
      outcome.delayMinutes = undefined;
      outcome.delaySource = undefined;
      outcome.delayKind = undefined;
      await outcome.save();
    }
  } else if (input.icao24 !== undefined) {
    trip.set("tracking.icao24", input.icao24 || undefined);
    trip.set("tracking.icao24Source", input.icao24 ? "entered by you" : undefined);
  }
  await trip.save();
  return ok({ trip: tripView(trip.toObject()), reset: flightChanged });
});

export const DELETE = withUser<P>(async (_req, { params, user }) => {
  await connectDB();
  const exists = await Trip.exists({ _id: params.id, userId: user.oid });
  if (!exists) throw notFound("Trip not found");
  await deleteTripCascade(user.oid, params.id);
  return ok({ ok: true });
});
