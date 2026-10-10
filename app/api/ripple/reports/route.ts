import { ok, withUser } from "@/lib/api";
import { deleteAllMyReports } from "@/lib/ripple/service";

/** Delete every observation you have shared. */
export const DELETE = withUser(async (_req, { user }) => ok({ deleted: await deleteAllMyReports(user.oid) }), {
  rateLimit: { name: "ripple-delete", limit: 10, windowSeconds: 600 },
});
