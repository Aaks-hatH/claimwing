import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { loadModel } from "@/lib/ripple/model";
import { predictWithArtifact } from "@/lib/ripple/model-core";
import { buildFrames } from "@/lib/ripple/sim/scenarios";

/**
 * Every frame of one simulated scenario, computed in memory by the real Flight Ripple code.
 * Deterministic and isolated: it reads no user data and writes nothing.
 */
export async function GET(req: Request, ctx: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await ctx.params;
  if (!/^[a-z-]{2,20}$/.test(scenario)) return NextResponse.json({ error: "Unknown scenario." }, { status: 404 });
  const rl = await rateLimit("demo", clientIp(req), 120, 60).catch(() => ({ ok: true, retryAfter: 0 }));
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const { artifact } = await loadModel();
  const built = buildFrames(scenario, artifact ? (stage, input) => predictWithArtifact(artifact, stage, input) : null);
  if (!built) return NextResponse.json({ error: "Unknown scenario." }, { status: 404 });
  return NextResponse.json({ ...built, simulated: true, model: artifact ? { version: artifact.model_version } : null });
}
