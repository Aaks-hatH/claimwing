import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";
import { AirplanesLiveProvider, OpenSkyProvider } from "@/lib/providers/adsb";
import { scheduleProvider } from "@/lib/providers/schedule";

export const dynamic = "force-dynamic";

/**
 * GET /api/health: configuration and database check (no secrets).
 * GET /api/health?deep=1: signed-in only; also makes one real call to each flight data source.
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const checks: Record<string, unknown> = {
    database: "unknown",
    storage: env.storageDriver(),
    scheduleProvider: env.scheduleProvider(),
    adsbPrimary: env.adsbPrimary(),
    openskyAuth: Boolean(env.openskyClientId()),
    googleSignIn: env.googleEnabled(),
    aiAssist: Boolean(env.anthropicKey()),
    cronSecretSet: Boolean(env.cronSecret()),
    internalCron: env.internalCron(),
    demoMode: env.demoMode(),
    authSecretSet: Boolean(process.env.AUTH_SECRET),
  };
  try {
    await connectDB();
    await mongoose.connection.db?.admin().ping();
    checks.database = "ok";
  } catch (e) {
    checks.database = `error: ${e instanceof Error ? e.message.split("\n")[0] : "unknown"}`;
  }

  if (deep) {
    const user = await getCurrentUser().catch(() => null);
    if (!user) return NextResponse.json({ error: "Sign in to run deep checks" }, { status: 401 });
    const probe = async (name: string, fn: () => Promise<unknown>) => {
      const t = Date.now();
      try {
        const r = await fn();
        checks[name] = { ok: true, ms: Date.now() - t, found: Boolean(r) };
      } catch (e) {
        checks[name] = { ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
      }
    };
    // A widely tracked aircraft hex; "found: false" only means it isn't flying right now.
    await probe("airplanesLive", () => AirplanesLiveProvider.getPositionByCallsign!("UAL1"));
    await probe("openSky", () => OpenSkyProvider.getPositionByIcao24!("a0b1c2"));
    const sp = scheduleProvider();
    if (sp?.getSchedule) {
      const today = new Date().toISOString().slice(0, 10);
      await probe("schedule", () => sp.getSchedule!("BA117", today));
    }
  }
  const ok = checks.database === "ok" && checks.authSecretSet === true;
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
