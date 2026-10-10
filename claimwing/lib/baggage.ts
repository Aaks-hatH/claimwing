import "server-only";
import { connectDB } from "./db";
import { BaggageItem, BaggagePhoto, DamageMarker, FlightOutcome, Trip, type BaggageDoc, type MarkerDoc, type PhotoDoc } from "@/models";
import { baggageEligibility } from "./eligibility";
import { bagView, tripView } from "./dal";
import { sdrOf, type CurrentUser } from "./session";

export type PhotoView = ReturnType<typeof photoView>;
export function photoView(p: PhotoDoc) {
  return {
    id: String(p._id),
    stage: p.stage,
    angle: p.angle,
    url: `/api/uploads/${p.webKey}`,
    originalUrl: `/api/uploads/${p.storageKey}`,
    width: p.width ?? null,
    height: p.height ?? null,
    takenAt: new Date(p.takenAt).toISOString(),
    exifTakenAt: p.exifTakenAt ? new Date(p.exifTakenAt).toISOString() : null,
    uploadedAt: new Date(p.createdAt).toISOString(),
    gps: p.gps?.lat != null && p.gps?.lon != null ? { lat: p.gps.lat, lon: p.gps.lon, accuracy: p.gps.accuracy ?? null } : null,
    sha256: p.sha256 ?? null,
    blurred: Boolean(p.blurred),
    blurRect: p.blurRect?.w ? p.blurRect : null,
  };
}

export type MarkerView = ReturnType<typeof markerView>;
export function markerView(m: MarkerDoc) {
  return {
    id: String(m._id),
    angle: m.angle,
    rect: { x: m.rect.x, y: m.rect.y, w: m.rect.w, h: m.rect.h },
    note: m.note ?? "",
    source: m.source,
    confirmed: m.confirmed,
    dismissed: m.dismissed,
  };
}

export async function getBagBundle(user: CurrentUser, bagId: string) {
  await connectDB();
  const bag = await BaggageItem.findOne({ _id: bagId, userId: user.oid }).lean<BaggageDoc>();
  if (!bag) return null;
  const [trip, outcome, photos, markers] = await Promise.all([
    Trip.findOne({ _id: bag.tripId, userId: user.oid }).lean(),
    FlightOutcome.findOne({ tripId: bag.tripId, userId: user.oid }).lean(),
    BaggagePhoto.find({ baggageId: bag._id, userId: user.oid }).lean<PhotoDoc[]>(),
    DamageMarker.find({ baggageId: bag._id, userId: user.oid, dismissed: false }).lean<MarkerDoc[]>(),
  ]);
  if (!trip) return null;
  const eligibility = baggageEligibility(bag, trip, outcome, sdrOf(user));
  return {
    trip: tripView(trip),
    bag: bagView(bag, {
      beforeCount: photos.filter((p) => p.stage === "before").length,
      afterCount: photos.filter((p) => p.stage === "after").length,
      markers: markers.filter((m) => m.confirmed).length,
      eligibility,
    }),
    photos: photos.map(photoView),
    markers: markers.map(markerView),
  };
}
