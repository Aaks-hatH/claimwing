import { z } from "zod";
import { notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { storage } from "@/lib/storage";
import { photoView } from "@/lib/baggage";
import { rect } from "@/lib/validation";
import { BaggagePhoto, DamageMarker } from "@/models";

type P = { id: string; photoId: string };

const body = z.object({ blurred: z.boolean(), blurRect: rect.nullable().optional() });

/** Toggle blurring (applied to exported copies only; the stored original never changes). */
export const PATCH = withUser<P>(async (req, { params, user }) => {
  const input = await parseJson(req, body);
  await connectDB();
  const photo = await BaggagePhoto.findOneAndUpdate(
    { _id: params.photoId, baggageId: params.id, userId: user.oid },
    input.blurRect ? { $set: { blurred: input.blurred, blurRect: input.blurRect } } : { $set: { blurred: input.blurred }, $unset: { blurRect: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!photo) throw notFound("Photo not found");
  return ok({ photo: photoView(photo) });
});

export const DELETE = withUser<P>(async (_req, { params, user }) => {
  await connectDB();
  const photo = await BaggagePhoto.findOneAndDelete({ _id: params.photoId, baggageId: params.id, userId: user.oid }).lean();
  if (!photo) throw notFound("Photo not found");
  await Promise.all([storage().delete(photo.storageKey), storage().delete(photo.webKey)]);
  if (photo.stage === "after") await DamageMarker.deleteMany({ baggageId: params.id, userId: user.oid, angle: photo.angle });
  return ok({ ok: true });
});
