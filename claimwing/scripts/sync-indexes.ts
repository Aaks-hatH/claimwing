/**
 * npm run db:indexes
 *
 * Creates any missing MongoDB indexes (Flight Ripple adds indexes on reports, predictions and trips).
 * Mongoose also builds missing indexes automatically when the app starts; run this before deploying
 * to a large production database so index builds don't happen during traffic.
 * All Flight Ripple schema changes are additive (new optional fields with defaults), so no data migration is needed.
 */
import "./load-env";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { FlightReport, RipplePrediction, Trip, User, DamageMarker } from "@/models";

async function main() {
  await connectDB();
  for (const m of [FlightReport, RipplePrediction, Trip, User, DamageMarker] as Array<{ modelName: string; syncIndexes: () => Promise<unknown> }>) {
    await m.syncIndexes();
    console.log(`indexes ok: ${m.modelName}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
