import { NextResponse } from "next/server";
import { notFound, withUser } from "@/lib/api";
import { loadClaimContext } from "@/lib/claims";
import { templateLetter } from "@/lib/letter";
import { renderClaimPdf } from "@/lib/pdf/render";
import { Claim } from "@/models";

export const maxDuration = 60;

/** The combined evidence packet as one PDF. */
export const GET = withUser<{ id: string }>(
  async (_req, { params, user }) => {
    const ctx = await loadClaimContext(user, params.id);
    if (!ctx) throw notFound("Claim not found");
    const pdf = await renderClaimPdf(ctx, ctx.claim.letterText || templateLetter(ctx));
    await Claim.updateOne({ _id: ctx.claim._id, userId: user.oid }, { $set: { lastExportAt: new Date() } });
    const name = `ClaimWing-${ctx.trip.flightNumber}-${ctx.trip.flightDate}${ctx.trip.demoMode ? "-DEMO" : ""}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { rateLimit: { name: "pdf", limit: 30, windowSeconds: 3600 } },
);
