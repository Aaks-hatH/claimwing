import "server-only";
import { env } from "@/lib/env";
import { cached, spaced } from "./cache";
import { ProviderError, type FlightDataProvider, type PositionReport } from "./types";

const FT = 0.3048;
const KT = 0.514444;
const USER_AGENT = "ClaimWing/1.0 (flight delay documentation; contact via app)";

/* ---------------------------- airplanes.live ---------------------------- */
/**
 * https://airplanes.live/api-guide/ — free, no key, 1 request/second, non-commercial use.
 * Supports lookups by hex (ICAO24) and callsign, so it can find a flight without a schedule API.
 */
type AirplanesLiveAc = {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  lat?: number;
  lon?: number;
  seen_pos?: number;
  seen?: number;
};

async function airplanesLive(path: string): Promise<PositionReport | null> {
  await spaced("airplanes.live", 1100);
  const res = await fetch(`https://api.airplanes.live/v2/${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (res.status === 429) throw new ProviderError("airplanes.live", "rate limited", 2);
  if (!res.ok) throw new ProviderError("airplanes.live", `HTTP ${res.status}`);
  const data = (await res.json()) as { ac?: AirplanesLiveAc[]; now?: number };
  const now = typeof data.now === "number" ? data.now : Date.now();
  const candidates = (data.ac ?? []).filter((a) => typeof a.lat === "number" && typeof a.lon === "number");
  if (!candidates.length) return null;
  // Freshest position wins (several entries can share a callsign).
  candidates.sort((a, b) => (a.seen_pos ?? 99) - (b.seen_pos ?? 99));
  const a = candidates[0];
  const onGround = a.alt_baro === "ground";
  const alt = typeof a.alt_baro === "number" ? a.alt_baro * FT : typeof a.alt_geom === "number" ? a.alt_geom * FT : onGround ? 0 : null;
  const rate = a.baro_rate ?? a.geom_rate;
  return {
    observedAt: new Date(now - (a.seen_pos ?? a.seen ?? 0) * 1000),
    lat: a.lat!,
    lon: a.lon!,
    altitude: alt,
    velocity: typeof a.gs === "number" ? a.gs * KT : null,
    track: a.track ?? null,
    verticalRate: typeof rate === "number" ? (rate * FT) / 60 : null,
    onGround,
    icao24: a.hex.toLowerCase().replace(/^~/, ""),
    callsign: a.flight?.trim() || null,
    registration: a.r ?? null,
    aircraftType: a.t ?? null,
    source: "ADS-B (airplanes.live)",
    raw: { hex: a.hex, flight: a.flight, alt_baro: a.alt_baro, gs: a.gs, seen_pos: a.seen_pos },
  };
}

export const AirplanesLiveProvider: FlightDataProvider = {
  name: "airplanes.live",
  kind: "adsb",
  getPositionByIcao24: (hex) => cached(`adsb:al:hex:${hex.toLowerCase()}`, 15, () => airplanesLive(`hex/${hex.toLowerCase()}`)),
  getPositionByCallsign: (cs) =>
    cached(`adsb:al:cs:${cs.toUpperCase()}`, 15, () => airplanesLive(`callsign/${encodeURIComponent(cs.toUpperCase())}`)),
};

/* ------------------------------- OpenSky ------------------------------- */
/**
 * https://opensky-network.org/api — OAuth2 client credentials (optional).
 * Anonymous: 400 credits/day per IP; standard account: 4,000/day.
 * An icao24 query costs 1 credit. Non-commercial use.
 */
let token: { value: string; expires: number } | null = null;

async function openskyToken(): Promise<string | null> {
  const id = env.openskyClientId();
  const secret = env.openskyClientSecret();
  if (!id || !secret) return null;
  if (token && token.expires > Date.now() + 30_000) return token.value;
  const res = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new ProviderError("OpenSky", `token HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  token = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 1800) * 1000 };
  return token.value;
}

type OpenSkyState = [
  string, string | null, string, number | null, number, number | null, number | null, number | null,
  boolean, number | null, number | null, number | null, number[] | null, number | null, string | null,
  boolean, number,
];

async function openskyByHex(hex: string): Promise<PositionReport | null> {
  const t = await openskyToken().catch(() => null);
  const res = await fetch(`https://opensky-network.org/api/states/all?icao24=${encodeURIComponent(hex.toLowerCase())}`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("X-Rate-Limit-Retry-After-Seconds")) || 60;
    throw new ProviderError("OpenSky", "daily credits used up", retry);
  }
  if (res.status === 401) token = null;
  if (!res.ok) throw new ProviderError("OpenSky", `HTTP ${res.status}`);
  const data = (await res.json()) as { time: number; states: OpenSkyState[] | null };
  const s = data.states?.find((x) => x[5] !== null && x[6] !== null);
  if (!s) return null;
  return {
    observedAt: new Date(((s[3] ?? s[4]) as number) * 1000),
    lat: s[6] as number,
    lon: s[5] as number,
    altitude: s[7] ?? s[13] ?? (s[8] ? 0 : null),
    velocity: s[9],
    track: s[10],
    verticalRate: s[11],
    onGround: s[8],
    icao24: s[0],
    callsign: s[1]?.trim() || null,
    source: "ADS-B (OpenSky Network)",
    raw: { time: data.time, last_contact: s[4], on_ground: s[8] },
  };
}

export const OpenSkyProvider: FlightDataProvider = {
  name: "OpenSky",
  kind: "adsb",
  getPositionByIcao24: (hex) => cached(`adsb:os:hex:${hex.toLowerCase()}`, 15, () => openskyByHex(hex)),
};

/** Tries the primary ADS-B source, then the other. Errors from one source don't stop the other. */
export async function getLivePosition(opts: { icao24?: string | null; callsign?: string | null }): Promise<{
  position: PositionReport | null;
  errors: string[];
}> {
  const errors: string[] = [];
  const order = env.adsbPrimary() === "opensky" ? [OpenSkyProvider, AirplanesLiveProvider] : [AirplanesLiveProvider, OpenSkyProvider];
  for (const p of order) {
    try {
      if (opts.icao24 && p.getPositionByIcao24) {
        const pos = await p.getPositionByIcao24(opts.icao24);
        if (pos) return { position: pos, errors };
      } else if (!opts.icao24 && opts.callsign && p.getPositionByCallsign) {
        const pos = await p.getPositionByCallsign(opts.callsign);
        if (pos) return { position: pos, errors };
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { position: null, errors };
}
