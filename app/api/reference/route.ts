import { NextResponse } from "next/server";
import { searchAirlines, searchAirports } from "@/lib/reference";

/** Public, cacheable lookup for airport and airline autocomplete. Reference data only, no user data. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 60);
  const type = url.searchParams.get("type");
  const items =
    type === "airline"
      ? searchAirlines(q).map((a) => ({ code: a.iata, label: a.name, sub: `${a.iata} · ${a.icao}${a.country ? ` · ${a.country}` : ""}` }))
      : searchAirports(q).map((a) => ({ code: a.iata, label: a.city ? `${a.city} — ${a.name}` : a.name, sub: `${a.iata} · ${a.country}`, tz: a.tz }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
