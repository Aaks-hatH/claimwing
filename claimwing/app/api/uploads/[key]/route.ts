import { NextResponse } from "next/server";
import { HttpError, errorResponse, notFound, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { storage } from "@/lib/storage";
import { connectDB } from "@/lib/db";
import { BaggageItem } from "@/models";

type Ctx = { params: Promise<{ key: string }> };

function validKey(key: string) {
  return /^[a-f0-9]{24}$/.test(key) || /^[a-f0-9-]{36}$/.test(key);
}

/** Streams a stored file to its owner only. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Please sign in.");
    const { key } = await ctx.params;
    if (!validKey(key)) throw notFound();
    const file = await storage().get(key);
    if (!file || file.meta.userId !== user.id) throw notFound();
    const download = new URL(req.url).searchParams.get("download") === "1";
    const safeName = file.meta.filename.replace(/[^\w.\- ]+/g, "_");
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.meta.contentType,
        "Content-Length": String(file.data.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Deletes a receipt. Photos are replaced by retaking them or removed via the photo endpoint. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Please sign in.");
    const { key } = await ctx.params;
    if (!validKey(key)) throw notFound();
    await connectDB();
    const bag = await BaggageItem.findOne({ userId: user.oid, "receipts.storageKey": key });
    if (!bag) throw notFound();
    bag.receipts = bag.receipts.filter((r) => r.storageKey !== key);
    await bag.save();
    await storage().delete(key);
    return ok({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
