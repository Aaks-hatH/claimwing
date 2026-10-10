import "server-only";
import type { Types } from "mongoose";
import { BaggageItem, FlightOutcome, Trip, User } from "@/models";
import { baggageEligibility } from "./eligibility";
import { notify } from "./notifications";
import { formatLocal } from "./time";

const REMIND_AT_DAYS = [3, 1];

/**
 * Creates 3-day and 1-day reminders for upcoming baggage deadlines.
 * Runs on dashboard load for the signed-in user, and for everyone from the cron job.
 */
export async function ensureDeadlineReminders(userId?: Types.ObjectId | string) {
  const filter: Record<string, unknown> = { status: { $in: ["arrived_damaged", "delayed", "lost"] } };
  if (userId) filter.userId = userId;
  const bags = await BaggageItem.find(filter).limit(userId ? 200 : 5000).lean();
  if (!bags.length) return 0;
  const tripIds = [...new Set(bags.map((b) => String(b.tripId)))];
  const [trips, outcomes] = await Promise.all([
    Trip.find({ _id: { $in: tripIds } }).lean(),
    FlightOutcome.find({ tripId: { $in: tripIds } }).lean(),
  ]);
  const users = new Map<string, { sdr: { rate: number; currency: string }; notify: boolean }>();
  const now = Date.now();
  let created = 0;

  for (const bag of bags) {
    const trip = trips.find((t) => String(t._id) === String(bag.tripId));
    if (!trip) continue;
    const uid = String(bag.userId);
    if (!users.has(uid)) {
      const u = await User.findById(uid).select("preferences").lean();
      users.set(uid, { sdr: { rate: u?.preferences?.sdrRate ?? 1.36, currency: u?.preferences?.homeCurrency ?? "USD" }, notify: u?.preferences?.notifyDeadlines ?? true });
    }
    const pref = users.get(uid)!;
    if (!pref.notify) continue;
    const outcome = outcomes.find((o) => String(o.tripId) === String(bag.tripId)) ?? null;
    const result = baggageEligibility(bag, trip, outcome, pref.sdr);
    for (const d of result?.deadlines ?? []) {
      if (d.kind === "limitation") continue;
      const daysLeft = (new Date(d.dueAt).getTime() - now) / 86_400_000;
      for (const at of REMIND_AT_DAYS) {
        if (daysLeft > 0 && daysLeft <= at) {
          await notify(bag.userId, {
            type: "deadline",
            title: `${d.label}: ${at === 1 ? "1 day" : `${at} days`} left`,
            message: `${bag.description} on ${trip.flightNumber}. Due by ${formatLocal(d.dueAt, null)}.`,
            href: `/app/trips/${trip._id}/baggage/${bag._id}`,
            dedupeKey: `deadline:${bag._id}:${d.kind}:${at}d`,
          });
          created++;
        }
      }
    }
  }
  return created;
}
