import "server-only";
import type { Types } from "mongoose";
import { BaggageItem, BaggagePhoto, Claim, DamageMarker, FlightOutcome, FlightSnapshot, Notification, Trip } from "@/models";
import { storage } from "./storage";

/** Deletes a bag with its photos (including stored files), markers and receipts. */
export async function deleteBagCascade(userId: Types.ObjectId, bagId: Types.ObjectId | string) {
  const bag = await BaggageItem.findOne({ _id: bagId, userId }).lean();
  if (!bag) return;
  const photos = await BaggagePhoto.find({ userId, baggageId: bag._id }).lean();
  const keys = [...photos.flatMap((p) => [p.storageKey, p.webKey]), ...(bag.receipts ?? []).map((r) => r.storageKey)];
  await Promise.all(keys.map((k) => storage().delete(k)));
  await Promise.all([
    BaggagePhoto.deleteMany({ userId, baggageId: bag._id }),
    DamageMarker.deleteMany({ userId, baggageId: bag._id }),
    BaggageItem.deleteOne({ _id: bag._id, userId }),
    Claim.updateMany({ userId }, { $pull: { baggageIds: bag._id } }),
  ]);
}

/** Deletes a trip and everything attached to it. */
export async function deleteTripCascade(userId: Types.ObjectId, tripId: Types.ObjectId | string) {
  const trip = await Trip.findOne({ _id: tripId, userId }).lean();
  if (!trip) return;
  const bags = await BaggageItem.find({ userId, tripId: trip._id }).select("_id").lean();
  for (const b of bags) await deleteBagCascade(userId, b._id);
  await Promise.all([
    FlightSnapshot.deleteMany({ userId, tripId: trip._id }),
    FlightOutcome.deleteMany({ userId, tripId: trip._id }),
    Claim.deleteMany({ userId, tripId: trip._id }),
    Notification.deleteMany({ userId, href: { $regex: `/app/trips/${trip._id}` } }),
    Trip.deleteOne({ _id: trip._id, userId }),
  ]);
}
