import { notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { deleteBagCascade } from "@/lib/cascade";
import { bagUpdate } from "@/lib/validation";
import { getBagBundle } from "@/lib/baggage";
import { BaggageItem } from "@/models";

type P = { id: string };

export const GET = withUser<P>(async (_req, { params, user }) => {
  const bundle = await getBagBundle(user, params.id);
  if (!bundle) throw notFound("Bag not found");
  return ok(bundle);
});

export const PATCH = withUser<P>(async (req, { params, user }) => {
  const input = await parseJson(req, bagUpdate);
  await connectDB();
  const bag = await BaggageItem.findOne({ _id: params.id, userId: user.oid });
  if (!bag) throw notFound("Bag not found");
  const dates = ["receivedAt", "reportedMissingAt", "deliveredAt"] as const;
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if ((dates as readonly string[]).includes(k)) bag.set(k, v ? new Date(v as string) : undefined);
    else bag.set(k, v ?? undefined);
  }
  // Keep dates consistent with the status the passenger chose.
  if (input.status === "arrived_damaged" && !bag.receivedAt) bag.receivedAt = new Date();
  if (input.status === "delayed" && !bag.reportedMissingAt) bag.reportedMissingAt = new Date();
  if (input.status === "received_ok" && !bag.receivedAt) bag.receivedAt = new Date();
  // Deadlines changed: allow fresh reminders.
  if (dates.some((d) => input[d] !== undefined) || input.status) bag.remindersSent = [];
  await bag.save();
  return ok({ ok: true });
});

export const DELETE = withUser<P>(async (_req, { params, user }) => {
  await connectDB();
  const exists = await BaggageItem.exists({ _id: params.id, userId: user.oid });
  if (!exists) throw notFound("Bag not found");
  await deleteBagCascade(user.oid, params.id);
  return ok({ ok: true });
});
