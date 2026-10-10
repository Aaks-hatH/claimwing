import { z } from "zod";
import { ok, parseJson, withUser } from "@/lib/api";
import { REPORT_TYPES } from "@/lib/ripple/reports";
import { submitReport } from "@/lib/ripple/service";

const body = z
  .object({
    type: z.enum(REPORT_TYPES),
    observedAt: z.string().datetime({ offset: true }).nullish(),
    value: z.union([z.string().max(8), z.number().int()]).nullish(),
    note: z.string().max(400).nullish(),
  })
  .strict();

/** Submit a structured observation about this trip's flight. Validated, deduplicated and rate limited server-side. */
export const POST = withUser<{ tripId: string }>(
  async (req, { params, user }) => {
    const input = await parseJson(req, body);
    const r = await submitReport(user, params.tripId, input);
    return ok(r, { status: 201 });
  },
  { rateLimit: { name: "ripple-report-user", limit: 30, windowSeconds: 3600 } },
);
