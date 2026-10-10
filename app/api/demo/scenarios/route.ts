import { NextResponse } from "next/server";
import { SCENARIOS } from "@/lib/ripple/sim/scenarios";

/** Public list of simulated Demo Center scenarios. No account or database involved. */
export function GET() {
  return NextResponse.json({
    scenarios: SCENARIOS.map(({ id, title, summary, expected, events }) => ({ id, title, summary, expected, events: events.map((e) => e.label) })),
  });
}
