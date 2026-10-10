import { z } from "zod";
import { ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models";

const body = z
  .object({
    onboarding: z.enum(["completed", "skipped", "reset"]).optional(),
    dismissHint: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
    resetHints: z.boolean().optional(),
  })
  .strict();

/** Stores first-run guidance state on the account, so hints and onboarding don't reappear on other devices. */
export const PATCH = withUser(async (req, { user }) => {
  const input = await parseJson(req, body);
  await connectDB();
  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  if (input.onboarding === "completed") set["guidance.onboardingCompletedAt"] = new Date();
  if (input.onboarding === "skipped") set["guidance.onboardingSkippedAt"] = new Date();
  if (input.onboarding === "reset") {
    unset["guidance.onboardingCompletedAt"] = "";
    unset["guidance.onboardingSkippedAt"] = "";
  }
  if (input.resetHints) set["guidance.dismissedHints"] = [];
  const update: Record<string, unknown> = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (input.dismissHint && !input.resetHints) update.$addToSet = { "guidance.dismissedHints": input.dismissHint };
  if (Object.keys(update).length) await User.updateOne({ _id: user.oid }, update);
  return ok({ ok: true });
});
