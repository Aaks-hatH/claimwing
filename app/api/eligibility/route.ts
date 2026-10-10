import { HttpError, notFound, ok, withUser } from "@/lib/api";
import { sdrOf } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { flightEligibility, baggageEligibility } from "@/lib/eligibility";
import { isObjectId } from "@/lib/utils";
import { BaggageItem, FlightOutcome, Trip } from "@/models";

/** GET /api/eligibility?tripId=… — flight and baggage eligibility from the stored facts. */
export const GET = withUser(async (req, { user }) => {
  const tripId = new URL(req.url).searchParams.get("tripId");
  if (!isObjectId(tripId)) throw new HttpError(400, "tripId is required");
  await connectDB();
  const trip = await Trip.findOne({ _id: tripId, userId: user.oid }).lean();
  if (!trip) throw notFound("Trip not found");
  const outcome = await FlightOutcome.findOne({ tripId: trip._id, userId: user.oid }).lean();
  const bags = await BaggageItem.find({ tripId: trip._id, userId: user.oid }).lean();
  return ok({
    flight: flightEligibility(trip, outcome),
    baggage: bags.map((b) => ({ id: String(b._id), description: b.description, result: baggageEligibility(b, trip, outcome, sdrOf(user)) })),
  });
});
