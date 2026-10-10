import { z } from "zod";
import { notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { claimView } from "@/lib/dal";
import { exportManifest, loadClaimContext } from "@/lib/claims";
import { flightEligibility } from "@/lib/eligibility";
import { Claim, FlightOutcome, Trip } from "@/models";

type P = { id: string };

export const GET = withUser<P>(async (_req, { params, user }) => {
  const ctx = await loadClaimContext(user, params.id);
  if (!ctx) throw notFound("Claim not found");
  return ok({ claim: claimView(ctx.claim), manifest: exportManifest(ctx) });
});

const body = z.object({
  status: z.enum(["draft", "ready", "sent", "awaiting_reply", "paid", "rejected"]).optional(),
  statusNote: z.string().trim().max(300).optional(),
  letterText: z.string().max(20_000).optional(),
  letterSource: z.enum(["template", "ai_polished", "edited"]).optional(),
  recoveredAmount: z.number().nonnegative().max(1_000_000).nullable().optional(),
  airlineReference: z.string().trim().max(60).nullable().optional(),
  refreshEligibility: z.boolean().optional(),
});

export const PATCH = withUser<P>(async (req, { params, user }) => {
  const input = await parseJson(req, body);
  await connectDB();
  const claim = await Claim.findOne({ _id: params.id, userId: user.oid });
  if (!claim) throw notFound("Claim not found");
  if (input.letterText !== undefined) {
    claim.letterText = input.letterText;
    claim.letterSource = input.letterSource ?? "edited";
  }
  if (input.recoveredAmount !== undefined) claim.recoveredAmount = input.recoveredAmount;
  if (input.airlineReference !== undefined) claim.airlineReference = input.airlineReference;
  if (input.status && input.status !== claim.status) {
    claim.status = input.status;
    claim.timeline.push({ at: new Date(), status: input.status, note: input.statusNote || null });
  }
  if (input.refreshEligibility && claim.type !== "baggage") {
    const trip = await Trip.findOne({ _id: claim.tripId, userId: user.oid }).lean();
    const outcome = trip ? await FlightOutcome.findOne({ tripId: trip._id, userId: user.oid }).lean() : null;
    const elig = trip ? flightEligibility(trip, outcome) : null;
    claim.eligibility = elig ? JSON.parse(JSON.stringify(elig)) : null;
    claim.amount = elig?.primary && elig.primary.kind !== "none" ? elig.primary.amount : null;
    claim.currency = elig?.primary?.currency ?? null;
    claim.markModified("eligibility");
  }
  await claim.save();
  return ok({ claim: claimView(claim.toObject()) });
});

export const DELETE = withUser<P>(async (_req, { params, user }) => {
  await connectDB();
  const r = await Claim.deleteOne({ _id: params.id, userId: user.oid });
  if (!r.deletedCount) throw notFound("Claim not found");
  return ok({ ok: true });
});
