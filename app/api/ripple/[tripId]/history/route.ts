import { ok, withUser } from "@/lib/api";
import { predictionHistory } from "@/lib/ripple/service";

export const dynamic = "force-dynamic";

/** Stored prediction versions for this flight, oldest first (for the timeline scrubber). */
export const GET = withUser<{ tripId: string }>(async (_req, { params, user }) => ok({ history: await predictionHistory(user.oid, params.tripId) }), {
  rateLimit: { name: "ripple-read", limit: 120, windowSeconds: 60 },
});
