import { z } from "zod";
import { HttpError, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { deleteTripCascade } from "@/lib/cascade";
import { ApiCache, Notification, Trip, User, BaggageItem, FlightOutcome, FlightSnapshot, Claim, BaggagePhoto, DamageMarker, FlightReport } from "@/models";

const prefs = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  preferences: z
    .object({
      units: z.enum(["metric", "imperial"]).optional(),
      timeFormat: z.enum(["24h", "12h"]).optional(),
      notifyDelays: z.boolean().optional(),
      notifyDeadlines: z.boolean().optional(),
      homeCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
      sdrRate: z.number().positive().max(10_000).optional(),
    })
    .optional(),
});

export const PATCH = withUser(async (req, { user }) => {
  const input = await parseJson(req, prefs);
  await connectDB();
  const set: Record<string, unknown> = {};
  if (input.name) set.name = input.name;
  for (const [k, v] of Object.entries(input.preferences ?? {})) if (v !== undefined) set[`preferences.${k}`] = v;
  await User.updateOne({ _id: user.oid }, { $set: set });
  return ok({ ok: true });
});

/** Permanently deletes the account and everything in it, including stored photos and receipts. */
export const DELETE = withUser(
  async (req, { user }) => {
    const { confirm } = await parseJson(req, z.object({ confirm: z.string() }));
    if (confirm.trim().toLowerCase() !== user.email.toLowerCase()) throw new HttpError(400, "Type your email address to confirm.");
    await connectDB();
    const trips = await Trip.find({ userId: user.oid }).select("_id").lean();
    for (const t of trips) await deleteTripCascade(user.oid, t._id);
    // Anything orphaned by earlier partial deletes.
    await Promise.all([
      BaggageItem.deleteMany({ userId: user.oid }),
      BaggagePhoto.deleteMany({ userId: user.oid }),
      DamageMarker.deleteMany({ userId: user.oid }),
      FlightOutcome.deleteMany({ userId: user.oid }),
      FlightSnapshot.deleteMany({ userId: user.oid }),
      Claim.deleteMany({ userId: user.oid }),
      Notification.deleteMany({ userId: user.oid }),
      FlightReport.deleteMany({ userId: user.oid }),
      ApiCache.deleteMany({ key: { $regex: `^user:${user.id}` } }),
    ]);
    await User.deleteOne({ _id: user.oid });
    return ok({ ok: true });
  },
  { rateLimit: { name: "account-delete", limit: 5, windowSeconds: 3600 } },
);
