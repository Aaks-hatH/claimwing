import { z } from "zod";
import { ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Notification } from "@/models";

export const GET = withUser(async (_req, { user }) => {
  await connectDB();
  const items = await Notification.find({ userId: user.oid }).sort({ createdAt: -1 }).limit(30).lean();
  return ok({
    items: items.map((n) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      message: n.message,
      href: n.href ?? null,
      readAt: n.readAt ? new Date(n.readAt).toISOString() : null,
      createdAt: new Date(n.createdAt).toISOString(),
    })),
  });
});

const body = z.union([z.object({ all: z.literal(true) }), z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) })]);

export const PATCH = withUser(async (req, { user }) => {
  const input = await parseJson(req, body);
  await connectDB();
  const filter = "all" in input ? { userId: user.oid, readAt: null } : { userId: user.oid, _id: input.id };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return ok({ ok: true });
});
