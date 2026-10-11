import { NextResponse } from "next/server";
import JSZip from "jszip";
import { notFound, withUser } from "@/lib/api";
import { loadClaimContext } from "@/lib/claims";
import { storage } from "@/lib/storage";
import { templateLetter } from "@/lib/letter";

export const maxDuration = 60;

const ext = (mime: string | null | undefined) =>
  mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime?.startsWith("image/hei") ? "heic" : "jpg";

/** ZIP of untouched original files plus a machine-readable evidence record with SHA-256 hashes. */
export const GET = withUser<{ id: string }>(
  async (_req, { params, user }) => {
    const ctx = await loadClaimContext(user, params.id);
    if (!ctx) throw notFound("Claim not found");
    const zip = new JSZip();
    const record: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      demo: ctx.trip.demoMode,
      flight: {
        number: ctx.trip.flightNumber,
        date: ctx.trip.flightDate,
        origin: ctx.trip.origin,
        destination: ctx.trip.destination,
        scheduledDeparture: ctx.trip.scheduledDeparture,
        scheduledArrival: ctx.trip.scheduledArrival,
        actualArrival: ctx.outcome?.actualArrival ?? null,
        delayMinutes: ctx.outcome?.delayMinutes ?? null,
        delaySource: ctx.outcome?.delaySource ?? null,
        evidence: ctx.evidence.map((e) => ({ kind: e.kind, time: e.time, source: e.source, note: e.note ?? null, recordedAt: e.recordedAt })),
      },
      eligibility: ctx.eligibility,
      files: [] as Array<{ path: string; sha256: string | null | undefined }>,
    };
    const files = record.files as Array<{ path: string; sha256: string | null | undefined }>;
    for (const b of ctx.bags) {
      const folder = `${b.bag.description.replace(/[^\w\- ]+/g, "").slice(0, 40) || "bag"}-${String(b.bag._id).slice(-6)}`;
      for (const p of b.photos) {
        const f = await storage().get(p.storageKey);
        if (!f) continue;
        const path = `${folder}/photos/${p.stage}-${p.angle}.${ext(p.mime)}`;
        zip.file(path, f.data);
        files.push({ path, sha256: p.sha256 });
      }
      for (const r of b.bag.receipts ?? []) {
        const f = await storage().get(r.storageKey);
        if (!f) continue;
        const path = `${folder}/receipts/${String(r._id).slice(-6)}-${(r.filename ?? "receipt").replace(/[^\w.\- ]+/g, "_")}`;
        zip.file(path, f.data);
        files.push({ path, sha256: r.sha256 });
      }
    }
    zip.file("letter.txt", ctx.claim.letterText || templateLetter(ctx));
    zip.file("evidence.json", JSON.stringify(record, null, 2));
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Vola-${ctx.trip.flightNumber}-${ctx.trip.flightDate}-originals.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { rateLimit: { name: "zip", limit: 20, windowSeconds: 3600 } },
);
