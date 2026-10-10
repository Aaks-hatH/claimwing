import "server-only";

/**
 * Central place for configuration. Values are read lazily so `next build`
 * works without secrets, and missing required values fail loudly at runtime.
 */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return v;
}

function bool(name: string, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function num(name: string, fallback: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = {
  mongoUri: () => req("MONGODB_URI"),
  /** Demo replay is available unless DEMO_MODE is explicitly false (hide it for a public launch). */
  demoMode: () => bool("DEMO_MODE", true),
  cronSecret: () => process.env.CRON_SECRET ?? "",
  internalCron: () => bool("INTERNAL_CRON"),
  storageDriver: () => (process.env.STORAGE_DRIVER === "local" ? "local" : "gridfs") as "local" | "gridfs",
  uploadDir: () => process.env.UPLOAD_DIR || "./uploads",
  maxUploadBytes: () => num("MAX_UPLOAD_MB", 10) * 1024 * 1024,

  aerodataboxKey: () => process.env.AERODATABOX_RAPIDAPI_KEY ?? "",
  aerodataboxHost: () => process.env.AERODATABOX_RAPIDAPI_HOST || "aerodatabox.p.rapidapi.com",
  aviationstackKey: () => process.env.AVIATIONSTACK_KEY ?? "",
  scheduleProvider: () => {
    const p = (process.env.SCHEDULE_PROVIDER || "").toLowerCase();
    if (p === "aviationstack" || p === "aerodatabox" || p === "none") return p;
    if (process.env.AERODATABOX_RAPIDAPI_KEY) return "aerodatabox";
    if (process.env.AVIATIONSTACK_KEY) return "aviationstack";
    return "none";
  },
  /** How often the schedule API may be called per flight while it is active (quota protection). */
  scheduleTtlSeconds: () => num("SCHEDULE_TTL_SECONDS", 600),
  openskyClientId: () => process.env.OPENSKY_CLIENT_ID ?? "",
  openskyClientSecret: () => process.env.OPENSKY_CLIENT_SECRET ?? "",
  adsbPrimary: () => (process.env.ADSB_PRIMARY === "opensky" ? "opensky" : "airplaneslive") as "opensky" | "airplaneslive",

  anthropicKey: () => process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",

  googleEnabled: () => Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  appUrl: () => process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000",
  contactEmail: () => process.env.CONTACT_EMAIL || "",
};
