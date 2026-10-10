import "server-only";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ClaimContext } from "@/lib/claims";
import { storage } from "@/lib/storage";
import { blurRegion } from "@/lib/images";
import { ClaimDocument, type PdfPhoto } from "./claim-document";

/** Builds the evidence-packet PDF. Blurred photos are blurred in the PDF only; originals stay untouched. */
export async function renderClaimPdf(ctx: NonNullable<ClaimContext>, letter: string): Promise<Buffer> {
  const photos = new Map<string, PdfPhoto[]>();
  for (const b of ctx.bags) {
    const list: PdfPhoto[] = [];
    for (const p of b.photos) {
      const file = await storage().get(p.webKey);
      if (!file) continue;
      const data = p.blurred ? await blurRegion(file.data, p.blurRect?.w ? p.blurRect : null) : file.data;
      list.push({
        angle: p.angle,
        stage: p.stage,
        data,
        takenAt: p.takenAt,
        exifTakenAt: p.exifTakenAt ?? null,
        sha256: p.sha256 ?? null,
        gps: p.gps?.lat != null && p.gps?.lon != null ? { lat: p.gps.lat, lon: p.gps.lon } : null,
        blurred: p.blurred,
      });
    }
    photos.set(String(b.bag._id), list);
  }
  const doc = React.createElement(ClaimDocument, { ctx, photos, letter, generatedAt: new Date() });
  // renderToBuffer expects a <Document> element; ClaimDocument returns one.
  return renderToBuffer(doc as unknown as Parameters<typeof renderToBuffer>[0]);
}
