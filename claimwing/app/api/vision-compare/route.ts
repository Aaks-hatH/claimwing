import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { HttpError, notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { markerView } from "@/lib/baggage";
import { ANGLE_ENUM } from "@/lib/validation";
import { BaggagePhoto, DamageMarker } from "@/models";

export const maxDuration = 60;

const body = z.object({ baggageId: z.string().regex(/^[a-f0-9]{24}$/), angle: ANGLE_ENUM });

const SYSTEM = `You compare two photos of the same piece of luggage: BEFORE (taken at check-in) and AFTER (taken at baggage claim).
List only visible physical differences that could be new damage: cracks, dents, holes, tears, scuffs, broken wheels, handles or zips, crushed corners, stains.
Ignore differences caused by lighting, camera angle, framing, shadows, reflections, or the bag being turned.
Coordinates are for the AFTER image, normalised from 0 to 1 (x, y = top-left corner; w, h = width and height).
Be conservative. If nothing is clearly different, return an empty list. Never guess who caused damage.`;

/**
 * Optional AI assist: proposes damage markers for the passenger to confirm or dismiss.
 * Proposals are stored as unconfirmed and labelled "Suggested, not confirmed" in the UI and excluded from the PDF until confirmed.
 */
export const POST = withUser(
  async (req, { user }) => {
    if (!env.anthropicKey()) throw new HttpError(501, "AI suggestions aren't enabled on this server.");
    const input = await parseJson(req, body);
    await connectDB();
    const photos = await BaggagePhoto.find({ baggageId: input.baggageId, userId: user.oid, angle: input.angle }).lean();
    const before = photos.find((p) => p.stage === "before");
    const after = photos.find((p) => p.stage === "after");
    if (!before || !after) throw notFound("Take both a before and an after photo of this side first.");
    const [b, a] = await Promise.all([storage().get(before.webKey), storage().get(after.webKey)]);
    if (!b || !a || b.meta.userId !== user.id || a.meta.userId !== user.id) throw notFound("Photo files not found");

    const client = new Anthropic({ apiKey: env.anthropicKey() });
    const res = await client.messages.create({
      model: env.anthropicModel(),
      max_tokens: 1200,
      system: SYSTEM,
      tools: [
        {
          name: "report_differences",
          description: "Report visible differences that could be new damage.",
          input_schema: {
            type: "object",
            properties: {
              differences: {
                type: "array",
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    description: { type: "string", description: "Short, factual description, e.g. 'Crack across lower left corner'" },
                    x: { type: "number" },
                    y: { type: "number" },
                    w: { type: "number" },
                    h: { type: "number" },
                    confidence: { type: "string", enum: ["low", "medium", "high"] },
                  },
                  required: ["description", "x", "y", "w", "h", "confidence"],
                },
              },
            },
            required: ["differences"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_differences" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `BEFORE photo (${input.angle}):` },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.data.toString("base64") } },
            { type: "text", text: `AFTER photo (${input.angle}):` },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: a.data.toString("base64") } },
          ],
        },
      ],
    });

    const tool = res.content.find((c) => c.type === "tool_use");
    const parsed = z
      .object({
        differences: z.array(
          z.object({ description: z.string().max(300), x: z.number(), y: z.number(), w: z.number(), h: z.number(), confidence: z.enum(["low", "medium", "high"]) }),
        ),
      })
      .safeParse(tool && "input" in tool ? tool.input : null);
    if (!parsed.success) return ok({ markers: [], note: "The AI didn't return usable suggestions. Mark damage yourself." });

    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    // Replace earlier unreviewed suggestions for this angle.
    await DamageMarker.deleteMany({ baggageId: input.baggageId, userId: user.oid, angle: input.angle, source: "ai", confirmed: false });
    const created = [];
    for (const d of parsed.data.differences) {
      const x = clamp(d.x), y = clamp(d.y);
      const w = Math.max(0.01, Math.min(1 - x, d.w)), h = Math.max(0.01, Math.min(1 - y, d.h));
      const m = await DamageMarker.create({
        baggageId: input.baggageId,
        userId: user.oid,
        angle: input.angle,
        rect: { x, y, w, h },
        note: `${d.description} (AI suggestion, ${d.confidence} confidence)`,
        source: "ai",
        confirmed: false,
      });
      created.push(markerView(m.toObject()));
    }
    return ok({ markers: created });
  },
  { rateLimit: { name: "vision", limit: 20, windowSeconds: 3600 } },
);
