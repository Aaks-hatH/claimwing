import "server-only";
import airportsData from "@/data/airports.json";
import airlinesData from "@/data/airlines.json";

export type Airport = {
  iata: string;
  icao: string | null;
  name: string;
  city: string | null;
  country: string;
  lat: number;
  lon: number;
  tz: string | null;
  size: "L" | "M" | "S";
};

export type Airline = { iata: string; icao: string; name: string; country: string | null };

const airports = airportsData as Airport[];
const airlines = airlinesData as Airline[];
const airportByIata = new Map(airports.map((a) => [a.iata, a]));
const airlineByIata = new Map(airlines.map((a) => [a.iata, a]));

export function getAirport(iata: string | null | undefined): Airport | null {
  if (!iata) return null;
  return airportByIata.get(iata.toUpperCase()) ?? null;
}

export function getAirline(iata: string | null | undefined): Airline | null {
  if (!iata) return null;
  return airlineByIata.get(iata.toUpperCase()) ?? null;
}

const sizeRank = { L: 0, M: 1, S: 2 } as const;

export function searchAirports(q: string, limit = 8): Airport[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const scored: Array<[number, Airport]> = [];
  for (const a of airports) {
    let score = -1;
    const iata = a.iata.toLowerCase();
    const city = (a.city ?? "").toLowerCase();
    const name = a.name.toLowerCase();
    if (iata === query) score = 0;
    else if (a.icao?.toLowerCase() === query) score = 1;
    else if (city.startsWith(query)) score = 2;
    else if (iata.startsWith(query)) score = 3;
    else if (name.includes(query) || city.includes(query)) score = 4;
    if (score >= 0) scored.push([score * 10 + sizeRank[a.size], a]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return scored.slice(0, limit).map(([, a]) => a);
}

export function searchAirlines(q: string, limit = 8): Airline[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const out: Array<[number, Airline]> = [];
  for (const a of airlines) {
    const n = a.name.toLowerCase();
    let s = -1;
    if (a.iata.toLowerCase() === query) s = 0;
    else if (a.icao.toLowerCase() === query) s = 1;
    else if (n.startsWith(query)) s = 2;
    else if (n.includes(query)) s = 3;
    if (s >= 0) out.push([s, a]);
  }
  out.sort((x, y) => x[0] - y[0] || x[1].name.localeCompare(y[1].name));
  return out.slice(0, limit).map(([, a]) => a);
}

/** "BA117" -> { airline: "BA", number: "117" }. Handles numeric airline codes like "3U8888". */
export function splitFlightNumber(flight: string): { airline: string; number: string } | null {
  const f = flight.replace(/\s+/g, "").toUpperCase();
  const m = f.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
  if (!m) return null;
  return { airline: m[1], number: m[2].replace(/^0+(?=\d)/, "") };
}

/** ATC callsign candidates for a flight number, e.g. BA117 -> BAW117. */
export function callsignFor(flightNumber: string): string | null {
  const parts = splitFlightNumber(flightNumber);
  if (!parts) return null;
  const airline = getAirline(parts.airline);
  if (!airline) return null;
  return `${airline.icao}${parts.number}`;
}
