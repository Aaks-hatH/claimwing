import "server-only";
import { connectDB } from "./db";
import { pollTrip } from "./flight-tracker";
import { ensureDeadlineReminders } from "./deadlines";
import { Trip } from "@/models";

/**
 * Background work: keep tracking flights that are in their active window even when
 * nobody has the page open, and create deadline reminders. Called by /api/cron/poll
 * (external scheduler) or by the in-process timer when INTERNAL_CRON=true.
 */
export async function runBackgroundCycle(opts: { maxTrips?: number } = {}) {
  await connectDB();
  const now = Date.now();
  const trips = await Trip.find({
    demoMode: { $ne: true },
    "tracking.finalizedAt": null,
    scheduledDeparture: { $lte: new Date(now + 3 * 3600_000) },
    scheduledArrival: { $gte: new Date(now - 48 * 3600_000) },
  })
    .sort({ scheduledArrival: 1 })
    .limit(opts.maxTrips ?? 40)
    .select("_id userId")
    .lean();

  let polled = 0;
  const errors: string[] = [];
  for (const t of trips) {
    try {
      await pollTrip(t._id, t.userId, { force: false });
      polled++;
    } catch (e) {
      errors.push(`${t._id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const reminders = await ensureDeadlineReminders().catch((e) => {
    errors.push(`reminders: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  });
  return { candidates: trips.length, polled, reminders, errors, at: new Date().toISOString() };
}
