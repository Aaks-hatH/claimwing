import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runBackgroundCycle } from "@/lib/cron";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = env.cronSecret();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : new URL(req.url).searchParams.get("secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Call every 5 minutes from any scheduler with `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron sends this header automatically; cron-job.org or GitHub Actions work too).
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runBackgroundCycle());
  } catch (e) {
    console.error("[cron] failed", e);
    return NextResponse.json({ error: "Background cycle failed" }, { status: 500 });
  }
}
