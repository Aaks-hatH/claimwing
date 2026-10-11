import "server-only";
import airportsData from "@/data/airports.json";
import airlinesData from "@/data/airlines.json";
import { parseFlightNumber } from "./flight-number";

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
const airlineByIcao = new Map(airlines.map((a) => [a.icao, a]));

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

export function getAirlineByIcao(icao: string | null | undefined): Airline | null {
  if (!icao) return null;
  return airlineByIcao.get(icao.toUpperCase()) ?? null;
}

/** Finds an airline from either kind of designator ("BA" or "BAW"). */
export function findAirline(code: string | null | undefined): Airline | null {
  if (!code) return null;
  return code.length === 3 ? getAirlineByIcao(code) : getAirline(code);
}

/**
 * The airline designator we store and compare on: the IATA code whenever the airline is in our
 * reference data (so BAW and BA are the same carrier), otherwise the code as given. An airline
 * we do not know, such as a cargo operator, is kept rather than rejected.
 */
export function canonicalCarrier(code: string): string {
  const c = code.trim().toUpperCase();
  return c.length === 3 ? (getAirlineByIcao(c)?.iata ?? c) : c;
}

/** "BA117" -> { airline: "BA", number: "117" }. Handles numeric airline codes ("3U8888") and ICAO codes ("GEC8225"). */
export function splitFlightNumber(flight: string): { airline: string; number: string } | null {
  const p = parseFlightNumber(flight);
  return p.ok ? { airline: p.carrier, number: p.number } : null;
}

/**
 * The flight-number spellings worth asking a schedule provider about, best first. Providers index by
 * IATA code, so a known ICAO code (BAW117) is tried as BA117 before the code the traveller typed.
 * Unknown airlines are asked about exactly as typed.
 */
export function scheduleQueryCandidates(flight: string): string[] {
  const p = parseFlightNumber(flight);
  if (!p.ok) return [];
  const out = [`${canonicalCarrier(p.carrier)}${p.number}`, p.flightNumber];
  return [...new Set(out)];
}

/** ATC callsign candidates for a flight number, e.g. BA117 -> BAW117, and GEC8225 -> GEC8225. */
export function callsignFor(flightNumber: string): string | null {
  const parts = parseFlightNumber(flightNumber);
  if (!parts.ok) return null;
  if (parts.carrierKind === "icao") return parts.flightNumber;
  const airline = getAirline(parts.carrier);
  if (!airline) return null;
  return `${airline.icao}${parts.number}`;
}
