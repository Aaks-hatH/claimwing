import { z } from "zod";
import { notFound, ok, parseJson, withUser } from "@/lib/api";
import { loadClaimContext } from "@/lib/claims";
import { polishLetter, templateLetter } from "@/lib/letter";

const body = z.object({
  claimId: z.string().regex(/^[a-f0-9]{24}$/),
  mode: z.enum(["template", "polish"]),
  text: z.string().max(20_000).optional(),
});

/** Returns a letter for the editor. Nothing is saved until the user saves it. */
export const POST = withUser(
  async (req, { user }) => {
    const input = await parseJson(req, body);
    const ctx = await loadClaimContext(user, input.claimId);
    if (!ctx) throw notFound("Claim not found");
    if (input.mode === "template") return ok({ text: templateLetter(ctx), source: "template" });
    const r = await polishLetter(input.text ?? ctx.claim.letterText ?? templateLetter(ctx));
    return ok({ text: r.text, source: r.changed ? "ai_polished" : "edited", changed: r.changed, note: r.reason ?? null });
  },
  { rateLimit: { name: "letter", limit: 30, windowSeconds: 3600 } },
);
