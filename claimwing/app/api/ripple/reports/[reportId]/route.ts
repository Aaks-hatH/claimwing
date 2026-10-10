import { ok, withUser } from "@/lib/api";
import { deleteMyReport } from "@/lib/ripple/service";

/** Delete one of your own observations. Other people's reports can't be deleted. */
export const DELETE = withUser<{ reportId: string }>(async (_req, { params, user }) => {
  await deleteMyReport(user.oid, params.reportId);
  return ok({ deleted: true });
});
