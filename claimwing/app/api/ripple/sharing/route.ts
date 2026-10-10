import { z } from "zod";
import { ok, parseJson, withUser } from "@/lib/api";
import { setCommunitySharing } from "@/lib/ripple/service";

/** Turn community sharing on or off. Off withdraws your existing reports from every aggregate. */
export const PUT = withUser(async (req, { user }) => {
  const { on } = await parseJson(req, z.object({ on: z.boolean() }).strict());
  await setCommunitySharing(user.oid, on);
  return ok({ on });
});
