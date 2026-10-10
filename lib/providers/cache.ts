import "server-only";
import { connectDB } from "@/lib/db";
import { ApiCache } from "@/models";

/**
 * Two-level cache for third-party API responses:
 * L1 in process memory, L2 in MongoDB (shared by every server instance).
 * This is what keeps us inside free-tier quotas when many users watch the same flight.
 */
type Entry = { value: unknown; expires: number };
const g = globalThis as unknown as { __apiL1?: Map<string, Entry>; __inflight?: Map<string, Promise<unknown>> };
const l1 = g.__apiL1 ?? (g.__apiL1 = new Map());
const inflight = g.__inflight ?? (g.__inflight = new Map());

export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = l1.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    await connectDB();
    const doc = await ApiCache.findOne({ key }).lean();
    if (doc && new Date(doc.expiresAt).getTime() > Date.now()) {
      const value = revive(doc.value) as T;
      l1.set(key, { value, expires: new Date(doc.expiresAt).getTime() });
      return value;
    }
    const value = await fn();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    l1.set(key, { value, expires: expiresAt.getTime() });
    await ApiCache.updateOne({ key }, { $set: { value, expiresAt } }, { upsert: true }).catch(() => undefined);
    if (l1.size > 2000) l1.clear();
    return value;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/** Dates come back from MongoDB Mixed fields as Date already; from L1 they are untouched. Strings stay strings. */
function revive(v: unknown): unknown {
  return v;
}

/** Simple per-process spacing for APIs with a requests-per-second limit. */
const queues = new Map<string, Promise<void>>();
export async function spaced(name: string, minIntervalMs: number): Promise<void> {
  const prev = queues.get(name) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  queues.set(
    name,
    prev.then(() => next),
  );
  await prev;
  setTimeout(release, minIntervalMs);
}

/** Drops a cached value everywhere (used when new observations make a cached result outdated). */
export async function invalidate(key: string): Promise<void> {
  l1.delete(key);
  await connectDB();
  await ApiCache.deleteOne({ key }).catch(() => undefined);
}
