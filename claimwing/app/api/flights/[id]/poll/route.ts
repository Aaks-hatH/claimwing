import { notFound, ok, withUser } from "@/lib/api";
import { getTrackerState, pollTrip } from "@/lib/flight-tracker";

type P = { id: string };

/** Current tracking state without calling external APIs. */
export const GET = withUser<P>(async (_req, { params, user }) => {
  const state = await getTrackerState(params.id, user.oid);
  if (!state) throw notFound("Trip not found");
  return ok(state);
});

/** Polls live sources (throttled and cached) and returns the updated state. Called by the Flight tab every 20 s. */
export const POST = withUser<P>(
  async (_req, { params, user }) => {
    const state = await pollTrip(params.id, user.oid);
    if (!state) throw notFound("Trip not found");
    return ok(state);
  },
  { rateLimit: { name: "poll", limit: 120, windowSeconds: 600 } },
);
