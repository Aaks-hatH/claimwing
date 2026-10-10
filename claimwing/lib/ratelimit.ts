import "server-only";
import { connectDB } from "./db";
import { RateLimit } from "@/models";

/**
 * Fixed-window rate limiter stored in MongoDB, so limits hold across
 * serverless instances and multiple app servers. Expired windows are
 * removed automatically by a TTL index.
 */
export async function rateLimit(name: string, id: string, limit: number, windowSeconds: number) {
  await connectDB();
  const now = Date.now();
  const window = Math.floor(now / (windowSeconds * 1000));
  const key = `${name}:${id}:${window}`;
  const expiresAt = new Date((window + 1) * windowSeconds * 1000 + 60_000);
  const doc = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  const count = doc?.count ?? 1;
  const retryAfter = Math.ceil(((window + 1) * windowSeconds * 1000 - now) / 1000);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
