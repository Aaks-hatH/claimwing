/**
 * Dated flight identity.
 *
 * A flight number ("BA117") repeats every day, so on its own it never identifies a flight.
 * Flight Ripple always works with a dated instance: the flight number, the local departure
 * date at the origin, and the origin airport, e.g. "BA117:2026-10-10:LHR". The origin is part
 * of the key because some flight numbers operate several legs on the same day.
 */
export type DatedFlightKey = string;

const KEY_RE = /^([A-Z0-9]{2,3}\d{1,4}[A-Z]?):(\d{4}-\d{2}-\d{2}):([A-Z]{3})$/;

export function datedFlightKey(flightNumber: string, localDate: string, origin: string): DatedFlightKey {
  const key = `${flightNumber.replace(/\s+/g, "").toUpperCase()}:${localDate}:${origin.toUpperCase()}`;
  if (!KEY_RE.test(key)) throw new Error(`Not a valid dated flight: ${key}`);
  return key;
}

export function parseFlightKey(key: string): { flightNumber: string; date: string; origin: string } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const [y, mo, d] = m[2].split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { flightNumber: m[1], date: m[2], origin: m[3] };
}

export function isFlightKey(key: unknown): key is DatedFlightKey {
  return typeof key === "string" && parseFlightKey(key) !== null;
}

/** The dated key for a ClaimWing trip (one trip is one dated flight leg). */
export function tripFlightKey(trip: { flightNumber: string; flightDate: string; origin: string }): DatedFlightKey {
  return datedFlightKey(trip.flightNumber, trip.flightDate, typeof trip.origin === "string" ? trip.origin : String(trip.origin));
}

/** "BA117 · 10 Oct" style label without implying anything about the day's status. */
export function flightKeyLabel(key: DatedFlightKey): string {
  const p = parseFlightKey(key);
  if (!p) return key;
  const d = new Date(`${p.date}T12:00:00Z`);
  return `${p.flightNumber} on ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} from ${p.origin}`;
}
