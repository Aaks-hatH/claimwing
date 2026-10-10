import { ok, withUser } from "@/lib/api";
import { rippleForTrip } from "@/lib/ripple/service";

export const dynamic = "force-dynamic";

/** Flight Ripple for one of your trips: forecast, aircraft rotation, passenger activity. */
export const GET = withUser<{ tripId: string }>(async (_req, { params, user }) => ok(await rippleForTrip(user, params.tripId)), {
  rateLimit: { name: "ripple-read", limit: 120, windowSeconds: 60 },
});
