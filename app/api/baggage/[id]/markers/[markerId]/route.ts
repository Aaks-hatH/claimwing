import { z } from "zod";
import { notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { markerView } from "@/lib/baggage";
import { rect } from "@/lib/validation";
import { DamageMarker } from "@/models";

type P = { id: string; markerId: string };

const body = z.object({
  note: z.string().trim().max(500).optional(),
  rect: rect.optional(),
  confirmed: z.boolean().optional(),
  dismissed: z.boolean().optional(),
});

/** Edit a marker, or confirm / dismiss an AI suggestion. */
export const PATCH = withUser<P>(async (req, { params, user }) => {
  const input = await parseJson(req, body);
  await connectDB();
  const m = await DamageMarker.findOneAndUpdate({ _id: params.markerId, baggageId: params.id, userId: user.oid }, { $set: input }, { returnDocument: "after" }).lean();
  if (!m) throw notFound("Marker not found");
  return ok({ marker: markerView(m) });
});

export const DELETE = withUser<P>(async (_req, { params, user }) => {
  await connectDB();
  const r = await DamageMarker.deleteOne({ _id: params.markerId, baggageId: params.id, userId: user.oid });
  if (!r.deletedCount) throw notFound("Marker not found");
  return ok({ ok: true });
});
