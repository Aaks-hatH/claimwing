import { z } from "zod";
import { notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { markerView } from "@/lib/baggage";
import { ANGLE_ENUM, rect } from "@/lib/validation";
import { BaggageItem, DamageMarker } from "@/models";

const body = z.object({ angle: ANGLE_ENUM, rect, note: z.string().trim().max(500).default(""), origin: z.enum(["drawn", "comparison"]).default("drawn") });

/**
 * Adds a damage marker. Markers the passenger draws are confirmed; areas found by the in-browser
 * photo comparison are stored as unconfirmed suggestions until the passenger confirms them.
 */
export const POST = withUser<{ id: string }>(async (req, { params, user }) => {
  const input = await parseJson(req, body);
  await connectDB();
  const bag = await BaggageItem.exists({ _id: params.id, userId: user.oid });
  if (!bag) throw notFound("Bag not found");
  const count = await DamageMarker.countDocuments({ baggageId: params.id, userId: user.oid });
  if (count >= 100) return ok({ error: "Too many markers on this bag" }, { status: 400 });
  const m = await DamageMarker.create({ baggageId: params.id, userId: user.oid, angle: input.angle, rect: input.rect, note: input.note, source: input.origin === "comparison" ? "comparison" : "user", confirmed: input.origin !== "comparison" });
  return ok({ marker: markerView(m.toObject()) }, { status: 201 });
});
