import { z } from "zod";
import { HttpError, notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { claimView } from "@/lib/dal";
import { flightEligibility } from "@/lib/eligibility";
import { loadClaimContext } from "@/lib/claims";
import { templateLetter } from "@/lib/letter";
import { BaggageItem, Claim, FlightOutcome, Trip } from "@/models";
import { notify } from "@/lib/notifications";

export const GET = withUser(async (_req, { user }) => {
  await connectDB();
  const claims = await Claim.find({ userId: user.oid }).sort({ updatedAt: -1 }).lean();
  const trips = await Trip.find({ userId: user.oid, _id: { $in: claims.map((c) => c.tripId) } }).select("flightNumber origin destination flightDate demoMode").lean();
  return ok({
    items: claims.map((c) => ({ ...claimView(c), trip: trips.find((t) => String(t._id) === String(c.tripId)) ?? null })),
  });
});

const body = z.object({
  tripId: z.string().regex(/^[a-f0-9]{24}$/),
  type: z.enum(["flight", "baggage", "combined"]),
  baggageIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(10).default([]),
});

/** Starts a claim as a draft with an eligibility snapshot and a template letter. Nothing is sent to anyone. */
export const POST = withUser(
  async (req, { user }) => {
    const input = await parseJson(req, body);
    await connectDB();
    const trip = await Trip.findOne({ _id: input.tripId, userId: user.oid }).lean();
    if (!trip) throw notFound("Trip not found");
    if (input.type !== "flight" && input.baggageIds.length === 0) throw new HttpError(400, "Choose at least one bag for a baggage claim.");
    const bags = await BaggageItem.find({ _id: { $in: input.baggageIds }, userId: user.oid, tripId: trip._id }).select("_id").lean();
    if (bags.length !== input.baggageIds.length) throw notFound("Bag not found");
    const outcome = await FlightOutcome.findOne({ tripId: trip._id, userId: user.oid }).lean();
    const elig = input.type === "baggage" ? null : flightEligibility(trip, outcome);
    const primary = elig?.primary;
    const claim = await Claim.create({
      userId: user.oid,
      tripId: trip._id,
      type: input.type,
      baggageIds: bags.map((b) => b._id),
      eligibility: elig ? JSON.parse(JSON.stringify(elig)) : null,
      amount: primary?.kind !== "none" ? primary?.amount ?? undefined : undefined,
      currency: primary?.currency ?? undefined,
      status: "draft",
      timeline: [{ at: new Date(), status: "draft", note: "Claim started" }],
    });
    const ctx = await loadClaimContext(user, claim._id);
    if (ctx) {
      claim.letterText = templateLetter(ctx);
      await claim.save();
    }
    await notify(user.oid, {
      type: "claim",
      title: `Claim started for ${trip.flightNumber}`,
      message: "Review the letter, fill in the placeholders, then export your evidence packet.",
      href: `/app/claims/${claim._id}`,
      dedupeKey: `claim_created:${claim._id}`,
    });
    return ok({ claim: claimView(claim.toObject()) }, { status: 201 });
  },
  { rateLimit: { name: "claim-create", limit: 30, windowSeconds: 3600 } },
);
