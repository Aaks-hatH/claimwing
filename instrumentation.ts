/**
 * Optional in-process scheduler for long-running servers (Fly.io, DigitalOcean, Docker, `npm start`).
 * Set INTERNAL_CRON=true to poll active flights every 2 minutes without an external cron service.
 * On serverless hosts (Vercel), leave it off and call /api/cron/poll from a scheduler instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const on = ["1", "true", "yes"].includes((process.env.INTERNAL_CRON ?? "").toLowerCase());
  if (!on || !process.env.MONGODB_URI) return;
  const g = globalThis as unknown as { __claimwingCron?: NodeJS.Timeout };
  if (g.__claimwingCron) return;
  const { runBackgroundCycle } = await import("./lib/cron");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runBackgroundCycle();
      if (r.polled || r.reminders || r.errors.length) console.log("[cron]", JSON.stringify(r));
    } catch (e) {
      console.error("[cron] cycle failed", e);
    } finally {
      running = false;
    }
  };
  g.__claimwingCron = setInterval(tick, 120_000);
  setTimeout(tick, 15_000);
  console.log("[cron] in-process flight polling enabled (every 2 minutes)");
}
