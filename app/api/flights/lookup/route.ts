import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { lookupFlight, parseLookupInput } from "@/lib/flight-lookup";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/** Looks up a flight's schedule to pre-fill the new-trip form. Uses the shared cache to save quota. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Malformed input is rejected before it costs a rate-limit slot or a provider call.
    const parsed = parseLookupInput(url.searchParams.get("flight"), url.searchParams.get("date"));
    if (!parsed.ok) return NextResponse.json(parsed.outcome.body, { status: parsed.outcome.httpStatus });

    const limit = await rateLimit("flight-lookup-public", clientIp(req), 30, 60 * 60);
    if (!limit.ok) {
      const message = "Too many flight searches from this network. Try again later, or enter the details from your booking.";
      return NextResponse.json(
        { found: false, status: "rate_limited", retryable: true, error: message, message },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }
    const outcome = await lookupFlight(parsed.input);
    return NextResponse.json(outcome.body, { status: outcome.httpStatus });
  } catch (err) {
    return errorResponse(err);
  }
}
