import { z } from "zod";
import { HttpError, notFound, ok, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import { processImage, sha256 } from "@/lib/images";
import { storage } from "@/lib/storage";
import { photoView } from "@/lib/baggage";
import { ANGLE_ENUM } from "@/lib/validation";
import { BaggageItem, BaggagePhoto } from "@/models";

export const maxDuration = 60;

const photoFields = z.object({
  kind: z.literal("photo"),
  baggageId: z.string().regex(/^[a-f0-9]{24}$/),
  stage: z.enum(["before", "after"]),
  angle: ANGLE_ENUM,
  takenAt: z.iso.datetime(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).max(100000).optional(),
});
const receiptFields = z.object({ kind: z.literal("receipt"), baggageId: z.string().regex(/^[a-f0-9]{24}$/) });

/**
 * Multipart upload for baggage photos and receipts. The original file is stored untouched
 * (with its SHA-256 recorded); photos also get an oriented JPEG copy for viewing and the PDF.
 */
export const POST = withUser(
  async (req, { user }) => {
    const max = env.maxUploadBytes();
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > max + 64 * 1024) throw new HttpError(413, `Files must be ${Math.round(max / 1024 / 1024)} MB or smaller.`);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "Upload could not be read. Please try again.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file was attached.");
    if (file.size > max) throw new HttpError(413, `Files must be ${Math.round(max / 1024 / 1024)} MB or smaller.`);
    if (file.size === 0) throw new HttpError(400, "The file is empty.");
    const fields = Object.fromEntries([...form.entries()].filter(([k]) => k !== "file").map(([k, v]) => [k, String(v)]));
    const buf = Buffer.from(await file.arrayBuffer());

    await connectDB();

    if (fields.kind === "receipt") {
      const f = receiptFields.parse(fields);
      const bag = await BaggageItem.findOne({ _id: f.baggageId, userId: user.oid });
      if (!bag) throw notFound("Bag not found");
      if ((bag.receipts?.length ?? 0) >= 30) throw new HttpError(400, "You can attach up to 30 receipts per bag.");
      const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
      let mime = "application/pdf";
      if (!isPdf) {
        // Validate images by decoding them.
        const img = await processImage(buf).catch((e: Error) => {
          throw new HttpError(415, e.message.replace("photo", "receipt"));
        });
        mime = `image/${img.format === "jpeg" ? "jpeg" : img.format}`;
      }
      const key = await storage().put(buf, { userId: user.id, contentType: mime, filename: file.name.slice(0, 120) || "receipt", kind: "receipt" });
      bag.receipts.push({ storageKey: key, filename: file.name.slice(0, 120) || "receipt", mime, size: buf.length, sha256: sha256(buf), uploadedAt: new Date() } as never);
      await bag.save();
      return ok({ ok: true, key }, { status: 201 });
    }

    const f = photoFields.parse(fields);
    const bag = await BaggageItem.exists({ _id: f.baggageId, userId: user.oid });
    if (!bag) throw notFound("Bag not found");
    let img;
    try {
      img = await processImage(buf);
    } catch (e) {
      throw new HttpError(415, e instanceof Error ? e.message : "Unsupported image");
    }
    const contentType = `image/${img.format === "jpeg" ? "jpeg" : img.format}`;
    const [storageKey, webKey] = await Promise.all([
      storage().put(buf, { userId: user.id, contentType, filename: file.name.slice(0, 120) || `${f.stage}-${f.angle}`, kind: "photo" }),
      storage().put(img.web, { userId: user.id, contentType: "image/jpeg", filename: `${f.stage}-${f.angle}.jpg`, kind: "photo_web" }),
    ]);

    // Retaking a photo replaces the previous one for that angle.
    const previous = await BaggagePhoto.findOne({ baggageId: f.baggageId, userId: user.oid, stage: f.stage, angle: f.angle }).lean();
    const gps = f.lat !== undefined && f.lon !== undefined ? { lat: f.lat, lon: f.lon, accuracy: f.accuracy } : img.exifGps ? { ...img.exifGps } : undefined;
    const photo = await BaggagePhoto.findOneAndUpdate(
      { baggageId: f.baggageId, userId: user.oid, stage: f.stage, angle: f.angle },
      {
        $set: {
          storageKey,
          webKey,
          mime: contentType,
          size: buf.length,
          width: img.width,
          height: img.height,
          sha256: img.sha256,
          takenAt: new Date(f.takenAt),
          exifTakenAt: img.exifTakenAt ?? undefined,
          gps,
          blurred: false,
        },
        $unset: { blurRect: 1 },
      },
      { upsert: true, returnDocument: "after" },
    ).lean();
    if (previous) await Promise.all([storage().delete(previous.storageKey), storage().delete(previous.webKey)]);
    return ok({ photo: photoView(photo!) }, { status: 201 });
  },
  { rateLimit: { name: "upload", limit: 120, windowSeconds: 3600 } },
);
