import "server-only";
import { cached } from "./providers/cache";

/**
 * Weather context near an airport around a given time, from Open-Meteo (no key needed).
 * Recent dates use the forecast API's archived runs; older dates use the ERA5 archive.
 * This is weather MODEL data, not an official airport observation (METAR). It's supporting
 * context for "was weather plausibly the cause?", never proof either way.
 */
export type WeatherContext = {
  airport: string;
  role: "departure" | "arrival";
  at: string;
  source: string;
  sourceUrl: string;
  hours: Array<{ time: string; code: number | null; description: string; gustsKmh: number | null; visibilityM: number | null; precipitationMm: number | null; snowfallCm: number | null }>;
  severe: boolean;
  summary: string;
  fetchedAt: string;
};

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 56: "Freezing drizzle", 57: "Dense freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Heavy rain showers",
  82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm",
  96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};
const SEVERE_CODES = new Set([56, 57, 65, 66, 67, 75, 82, 86, 95, 96, 99]);

function hourIso(d: Date) {
  return d.toISOString().slice(0, 13) + ":00";
}

export async function weatherAround(opts: {
  airport: string;
  role: "departure" | "arrival";
  lat: number;
  lon: number;
  at: Date;
}): Promise<WeatherContext | null> {
  const start = new Date(opts.at.getTime() - 2 * 3600_000);
  const end = new Date(opts.at.getTime() + 2 * 3600_000);
  if (start.getTime() > Date.now() + 15 * 86_400_000) return null;
  const ageDays = (Date.now() - opts.at.getTime()) / 86_400_000;
  const useArchive = ageDays > 80;
  const hourly = useArchive
    ? "weather_code,wind_gusts_10m,precipitation,snowfall"
    : "weather_code,wind_gusts_10m,visibility,precipitation,snowfall";
  const base = useArchive ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast";
  const range = useArchive
    ? `start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}`
    : `start_hour=${hourIso(start)}&end_hour=${hourIso(end)}`;
  const url = `${base}?latitude=${opts.lat}&longitude=${opts.lon}&hourly=${hourly}&${range}&timezone=GMT&wind_speed_unit=kmh`;

  const key = `wx:${opts.airport}:${hourIso(opts.at)}`;
  return cached(key, ageDays > 1 ? 7 * 86400 : 3600, async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { hourly?: Record<string, Array<number | string | null>> };
    const h = data.hourly;
    if (!h?.time) return null;
    const hours = (h.time as string[])
      .map((t, i) => ({
        time: `${t}Z`,
        code: (h.weather_code?.[i] as number | null) ?? null,
        description: WMO[(h.weather_code?.[i] as number) ?? -1] ?? "Unknown",
        gustsKmh: (h.wind_gusts_10m?.[i] as number | null) ?? null,
        visibilityM: (h.visibility?.[i] as number | null) ?? null,
        precipitationMm: (h.precipitation?.[i] as number | null) ?? null,
        snowfallCm: (h.snowfall?.[i] as number | null) ?? null,
      }))
      .filter((x) => {
        const t = new Date(x.time).getTime();
        return t >= start.getTime() - 1 && t <= end.getTime() + 1;
      });
    if (!hours.length) return null;
    const severe = hours.some(
      (x) => (x.code !== null && SEVERE_CODES.has(x.code)) || (x.gustsKmh ?? 0) >= 75 || (x.visibilityM !== null && x.visibilityM < 800),
    );
    const worst = [...hours].sort((a, b) => (b.gustsKmh ?? 0) - (a.gustsKmh ?? 0))[0];
    const codes = [...new Set(hours.map((x) => x.description))].join(", ").toLowerCase();
    const summary = `${opts.role === "arrival" ? "Arrival" : "Departure"} at ${opts.airport}: ${codes}; strongest gusts about ${Math.round(worst.gustsKmh ?? 0)} km/h${
      hours.some((x) => x.visibilityM !== null) ? `, lowest visibility about ${Math.round(Math.min(...hours.map((x) => x.visibilityM ?? 1e9)) / 100) / 10} km` : ""
    }. ${severe ? "Model data shows potentially disruptive weather." : "Model data shows no severe weather in this window."}`;
    return {
      airport: opts.airport,
      role: opts.role,
      at: opts.at.toISOString(),
      source: useArchive ? "Open-Meteo historical weather (ERA5 reanalysis)" : "Open-Meteo weather model data",
      sourceUrl: url,
      hours,
      severe,
      summary,
      fetchedAt: new Date().toISOString(),
    } satisfies WeatherContext;
  });
}

/**
 * Current conditions at an airport, in the units the delay model was trained with
 * (km/h, km, mm, degrees C). Used as model inputs only; cached for 30 minutes per airport.
 */
export type WeatherNow = {
  windKmh: number | null;
  visibilityKm: number | null;
  precipMm: number | null;
  tempC: number | null;
  code: number | null;
  severe: boolean;
  description: string;
  fetchedAt: string;
  source: string;
};

export async function weatherNow(airport: string, lat: number, lon: number): Promise<WeatherNow | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility&wind_speed_unit=kmh&timezone=GMT`;
  return cached(`wxnow:${airport}`, 1800, async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
      if (!res.ok) return null;
      const c = ((await res.json()) as { current?: Record<string, number | null> }).current;
      if (!c) return null;
      const code = c.weather_code ?? null;
      const vis = c.visibility ?? null;
      return {
        windKmh: c.wind_speed_10m ?? null,
        visibilityKm: vis === null ? null : Math.round((vis / 1000) * 10) / 10,
        precipMm: c.precipitation ?? null,
        tempC: c.temperature_2m ?? null,
        code,
        severe: (code !== null && SEVERE_CODES.has(code)) || (c.wind_gusts_10m ?? 0) >= 75 || (vis !== null && vis < 800),
        description: WMO[code ?? -1] ?? "Unknown",
        fetchedAt: new Date().toISOString(),
        source: "Open-Meteo current conditions (weather model data)",
      };
    } catch {
      return null;
    }
  });
}
