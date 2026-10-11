/**
 * npm run seed
 *
 * Creates (or resets) a demo account with one complete demo trip:
 *  - a delayed flight that replays from data/replays (labelled "Demo replay" everywhere)
 *  - a checked bag with generated before/after photos and one confirmed damage marker
 *
 * Demo login: demo@vola.app / the SEED_PASSWORD env var (default: vola-demo-2026)
 */
import "./load-env";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { createDemoTrip } from "@/lib/trips";
import { storage } from "@/lib/storage";
import { processImage } from "@/lib/images";
import { deleteTripCascade } from "@/lib/cascade";
import { BaggageItem, BaggagePhoto, DamageMarker, Notification, Trip, User } from "@/models";

const EMAIL = "demo@vola.app";
const PASSWORD = process.env.SEED_PASSWORD || "vola-demo-2026";
const ANGLES = ["front", "back", "left", "right", "top", "bottom", "tag"] as const;

/** Draws a simple suitcase illustration for an angle. `damaged` adds a crack and a scuff. */
function suitcaseSvg(angle: string, damaged: boolean) {
  const w = 1200, h = 900;
  const body =
    angle === "left" || angle === "right"
      ? `<rect x="470" y="140" width="260" height="620" rx="36" fill="#475569"/>`
      : angle === "top" || angle === "bottom"
        ? `<rect x="230" y="300" width="740" height="300" rx="40" fill="#475569"/>`
        : angle === "tag"
          ? `<rect x="250" y="330" width="700" height="240" rx="18" fill="#f8fafc" stroke="#94a3b8" stroke-width="6"/>
             <text x="600" y="420" font-family="Helvetica, Arial" font-size="54" text-anchor="middle" fill="#0f172a">BA 123456</text>
             <text x="600" y="500" font-family="Helvetica, Arial" font-size="34" text-anchor="middle" fill="#475569">LHR → JFK · DEMO</text>`
          : `<rect x="340" y="140" width="520" height="620" rx="44" fill="#475569"/>
             <rect x="540" y="90" width="120" height="60" rx="14" fill="none" stroke="#334155" stroke-width="18"/>
             <line x1="420" y1="200" x2="420" y2="700" stroke="#64748b" stroke-width="10"/>
             <line x1="600" y1="200" x2="600" y2="700" stroke="#64748b" stroke-width="10"/>
             <line x1="780" y1="200" x2="780" y2="700" stroke="#64748b" stroke-width="10"/>`;
  const wheels = angle === "bottom" || angle === "front" || angle === "back" ? `<circle cx="400" cy="790" r="28" fill="#1e293b"/><circle cx="800" cy="790" r="28" fill="#1e293b"/>` : "";
  const damage =
    damaged && angle === "front"
      ? `<path d="M380 250 L430 300 L410 340 L460 390 L440 430" stroke="#0f172a" stroke-width="9" fill="none" stroke-linecap="round"/>`
      : damaged && angle === "bottom"
        ? `<circle cx="400" cy="790" r="28" fill="#94a3b8"/><path d="M370 780 L430 800" stroke="#0f172a" stroke-width="6"/>`
        : "";
  const label = `<text x="40" y="70" font-family="Helvetica, Arial" font-size="34" fill="#0f172a">${damaged ? "AFTER" : "BEFORE"} · ${angle.toUpperCase()} · generated demo image</text>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${damaged ? "#e2e8f0" : "#f1f5f9"}"/>${label}${body}${wheels}${damage}</svg>`);
}

async function main() {
  await connectDB();
  let user = await User.findOne({ email: EMAIL });
  if (user) {
    const trips = await Trip.find({ userId: user._id }).select("_id").lean();
    for (const t of trips) await deleteTripCascade(user._id, t._id);
    await Notification.deleteMany({ userId: user._id });
    user.passwordHash = await bcrypt.hash(PASSWORD, 12);
    await user.save();
  } else {
    user = await User.create({ name: "Demo Traveller", email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 12), provider: "credentials", preferences: { homeCurrency: "GBP", sdrRate: 1.02 } });
  }

  const trip = await createDemoTrip(user._id, user.name);
  const bag = await BaggageItem.create({
    tripId: trip._id,
    userId: user._id,
    description: "Grey hard-shell suitcase (demo)",
    tagNumber: "BA123456",
    contentsCategory: "clothing",
    estimatedValue: { amount: 450, currency: "GBP" },
    status: "arrived_damaged",
    receivedAt: new Date(),
    pirReference: "JFKBA12345",
  });

  const t0 = Date.now() - 9 * 3600_000;
  for (const stage of ["before", "after"] as const) {
    for (const [i, angle] of ANGLES.entries()) {
      const jpg = await sharp(suitcaseSvg(angle, stage === "after")).jpeg({ quality: 85 }).toBuffer();
      const img = await processImage(jpg);
      const [storageKey, webKey] = await Promise.all([
        storage().put(jpg, { userId: String(user._id), contentType: "image/jpeg", filename: `${stage}-${angle}.jpg`, kind: "photo" }),
        storage().put(img.web, { userId: String(user._id), contentType: "image/jpeg", filename: `${stage}-${angle}-web.jpg`, kind: "photo_web" }),
      ]);
      await BaggagePhoto.create({
        baggageId: bag._id,
        userId: user._id,
        stage,
        angle,
        storageKey,
        webKey,
        mime: "image/jpeg",
        size: jpg.length,
        width: img.width,
        height: img.height,
        sha256: img.sha256,
        takenAt: new Date(stage === "before" ? t0 + i * 20_000 : Date.now() - 20 * 60_000 + i * 20_000),
        blurred: angle === "tag",
      });
    }
  }
  await DamageMarker.create({
    baggageId: bag._id,
    userId: user._id,
    angle: "front",
    rect: { x: 0.3, y: 0.25, w: 0.12, h: 0.25 },
    note: "Crack in the shell, upper left (demo)",
    source: "user",
    confirmed: true,
  });

  console.log(`Seeded demo account ${EMAIL} / ${PASSWORD}`);
  console.log(`Demo trip ${trip.flightNumber}: /app/trips/${trip._id}?tab=flight`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
