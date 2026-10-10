import { z } from "zod";
import { notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { bagInput } from "@/lib/validation";
import { BaggageItem, Trip } from "@/models";

const body = bagInput.extend({ tripId: z.string().regex(/^[a-f0-9]{24}$/) });

export const POST = withUser(
  async (req, { user }) => {
    const input = await parseJson(req, body);
    await connectDB();
    const trip = await Trip.exists({ _id: input.tripId, userId: user.oid });
    if (!trip) throw notFound("Trip not found");
    const bag = await BaggageItem.create({
      tripId: input.tripId,
      userId: user.oid,
      description: input.description,
      tagNumber: input.tagNumber ?? undefined,
      contentsCategory: input.contentsCategory,
      estimatedValue: input.estimatedValue ?? undefined,
      notes: input.notes ?? undefined,
    });
    return ok({ id: String(bag._id) }, { status: 201 });
  },
  { rateLimit: { name: "bag-create", limit: 60, windowSeconds: 3600 } },
);
