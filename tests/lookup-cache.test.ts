import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ writes: [] as Array<{ key: string; expiresAt: Date }> }));
vi.mock("@/lib/db", () => ({ connectDB: async () => undefined }));
vi.mock("@/models", () => ({
  ApiCache: {
    findOne: () => ({ lean: async () => null }),
    updateOne: async (q: { key: string }, u: { $set: { expiresAt: Date } }) => (db.writes.push({ key: q.key, expiresAt: u.$set.expiresAt }), {}),
    deleteOne: async () => ({}),
  },
}));

import { cached } from "@/lib/providers/cache";

beforeEach(() => {
  db.writes.length = 0;
  (globalThis as { __apiL1?: Map<string, unknown> }).__apiL1?.clear();
});

describe("cached() with a value-dependent TTL", () => {
  it("keeps a found flight for hours but an empty result only minutes", async () => {
    const ttl = (v: unknown[]) => (v.length ? 6 * 3600 : 300);
    const now = Date.now();
    await cached("k-found", ttl, async () => [1]);
    await cached("k-empty", ttl, async () => [] as number[]);
    const found = db.writes.find((w) => w.key === "k-found")!;
    const empty = db.writes.find((w) => w.key === "k-empty")!;
    expect(found.expiresAt.getTime() - now).toBeGreaterThan(5.9 * 3600_000);
    expect(empty.expiresAt.getTime() - now).toBeLessThan(310_000);
  });

  it("does not cache a failure, so the next attempt can succeed", async () => {
    await expect(cached("k-fail", 60, async () => Promise.reject(new Error("503")))).rejects.toThrow("503");
    expect(await cached("k-fail", 60, async () => "ok")).toBe("ok");
  });

  it("still accepts a plain number", async () => {
    expect(await cached("k-num", 60, async () => 7)).toBe(7);
  });
});
