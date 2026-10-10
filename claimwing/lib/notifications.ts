import "server-only";
import type { Types } from "mongoose";
import { Notification } from "@/models";

/** Creates a notification once per dedupeKey (repeat calls are no-ops). */
export async function notify(
  userId: Types.ObjectId | string,
  n: { type: "delay_alert" | "landed" | "deadline" | "claim" | "system"; title: string; message: string; href?: string; dedupeKey: string },
) {
  await Notification.updateOne(
    { userId, dedupeKey: n.dedupeKey },
    { $setOnInsert: { userId, ...n } },
    { upsert: true },
  ).catch((e: unknown) => {
    // Duplicate key races between concurrent pollers are expected and harmless.
    if (!(e instanceof Error && /E11000/.test(e.message))) throw e;
  });
}
