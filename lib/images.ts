import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import exifReader from "exif-reader";

const ACCEPTED = new Set(["jpeg", "png", "webp", "heif", "avif"]);

export type ProcessedImage = {
  web: Buffer; // auto-rotated JPEG, max 1600 px, metadata removed
  width: number;
  height: number;
  format: string;
  sha256: string;
  exifTakenAt: Date | null;
  exifGps: { lat: number; lon: number } | null;
};

/** Validates by decoding (not by trusting the file name or MIME type) and builds the viewing copy. */
export async function processImage(original: Buffer): Promise<ProcessedImage> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(original).metadata();
  } catch {
    throw new Error("This file isn't an image we can read. Use a JPEG or PNG photo.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) {
    throw new Error("Unsupported image format. Use a JPEG, PNG or WebP photo.");
  }
  let web: Buffer;
  try {
    web = await sharp(original).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    throw new Error("We couldn't process this photo. If it's an iPhone HEIC photo, set Camera > Formats to Most Compatible, or take it from this page.");
  }
  const webMeta = await sharp(web).metadata();

  let exifTakenAt: Date | null = null;
  let exifGps: { lat: number; lon: number } | null = null;
  if (meta.exif) {
    try {
      const ex = exifReader(meta.exif) as {
        Photo?: { DateTimeOriginal?: Date };
        Image?: { DateTime?: Date };
        GPSInfo?: { GPSLatitude?: number[]; GPSLatitudeRef?: string; GPSLongitude?: number[]; GPSLongitudeRef?: string };
      };
      const d = ex.Photo?.DateTimeOriginal ?? ex.Image?.DateTime;
      if (d instanceof Date && !Number.isNaN(d.getTime())) exifTakenAt = d;
      const g = ex.GPSInfo;
      if (g?.GPSLatitude?.length === 3 && g.GPSLongitude?.length === 3) {
        const dms = (v: number[]) => v[0] + v[1] / 60 + v[2] / 3600;
        exifGps = {
          lat: dms(g.GPSLatitude) * (g.GPSLatitudeRef === "S" ? -1 : 1),
          lon: dms(g.GPSLongitude) * (g.GPSLongitudeRef === "W" ? -1 : 1),
        };
      }
    } catch {
      // Unreadable EXIF is common and not an error.
    }
  }

  return {
    web,
    width: webMeta.width ?? 0,
    height: webMeta.height ?? 0,
    format: meta.format,
    sha256: createHash("sha256").update(original).digest("hex"),
    exifTakenAt,
    exifGps,
  };
}

/** Returns a copy with a region blurred (normalised rect). The stored original is never changed. */
export async function blurRegion(image: Buffer, rect?: { x: number; y: number; w: number; h: number } | null): Promise<Buffer> {
  const img = sharp(image);
  const { width = 0, height = 0 } = await img.metadata();
  if (!rect || rect.w <= 0 || rect.h <= 0) {
    return sharp(image).blur(40).jpeg({ quality: 80 }).toBuffer();
  }
  const left = Math.max(0, Math.round(rect.x * width));
  const top = Math.max(0, Math.round(rect.y * height));
  const w = Math.max(1, Math.min(width - left, Math.round(rect.w * width)));
  const h = Math.max(1, Math.min(height - top, Math.round(rect.h * height)));
  const patch = await sharp(image).extract({ left, top, width: w, height: h }).blur(30).toBuffer();
  return sharp(image).composite([{ input: patch, left, top }]).jpeg({ quality: 82 }).toBuffer();
}

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}
