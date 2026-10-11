/**
 * Flight-number parsing shared by the browser (signup, track-a-flight, trip form) and the server
 * (lookup API, trip validation). Keeping one implementation is what stops a number being accepted
 * by one layer and rejected by another.
 *
 * This module is deliberately free of `server-only` and of any airline data. It answers one question:
 * "is this text shaped like a flight number?". Whether the flight actually exists is a separate
 * question, answered by the schedule provider.
 *
 * Accepted shapes (case and spacing do not matter):
 *   - IATA airline designator, 2 characters with at least one letter, then 1-4 digits and an
 *     optional operational suffix letter:   BA117, 3U8888, U2 8013, ba 0117
 *   - ICAO airline designator, 3 letters, same number part:   BAW117, GEC8225, AAL100
 */

export type CarrierKind = "iata" | "icao";

export type FlightNumberParts = {
  /** Airline designator exactly as typed (upper-cased): "BA", "3U" or "GEC". */
  carrier: string;
  carrierKind: CarrierKind;
  /** Digits plus optional suffix letter, leading zeros removed: "117", "8888", "12A". */
  number: string;
  /** carrier + number, e.g. "GEC8225". */
  flightNumber: string;
};

export type FlightNumberIssue = "empty" | "format";

export type ParsedFlightNumber = ({ ok: true } & FlightNumberParts) | { ok: false; issue: FlightNumberIssue; message: string };

/** Whitespace (including non-breaking), zero-width characters and hyphens/dashes are formatting, not content. */
const SEPARATORS = /[\s ​-‍⁠﻿‐-―-]/g;
const FULL = /^([A-Z0-9]{2}|[A-Z]{3})(\d{1,4}[A-Z]?)$/;
const NUMBER_ONLY = /^\d{1,4}[A-Z]?$/;

export const FLIGHT_NUMBER_EXAMPLES = "BA117, 3U8888 or GEC8225";

/** Trim, drop spaces and dashes, fold full-width characters, upper-case. */
export function normalizeFlightInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFKC").replace(SEPARATORS, "").toUpperCase();
}

/** A 3-letter ICAO code, or a 2-character IATA code that contains at least one letter (so "12" is not an airline). */
export function isAirlineCode(code: unknown): code is string {
  if (typeof code !== "string") return false;
  const c = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) || (/^[A-Z0-9]{2}$/.test(c) && /[A-Z]/.test(c));
}

export function carrierKindOf(code: string): CarrierKind {
  return code.length === 3 ? "icao" : "iata";
}

function stripZeros(n: string): string | null {
  const s = n.replace(/^0+(?=\d)/, "");
  return /^0[A-Z]?$/.test(s) ? null : s; // flight 0 does not exist
}

export function describeFlightNumberIssue(issue: FlightNumberIssue, raw?: unknown): string {
  if (issue === "empty") return `Enter your flight number, for example ${FLIGHT_NUMBER_EXAMPLES}.`;
  const shown = typeof raw === "string" ? raw.trim().slice(0, 24) : "";
  return `${shown ? `“${shown}” doesn't` : "That doesn't"} look like a flight number. Use the airline code followed by the number, like ${FLIGHT_NUMBER_EXAMPLES}.`;
}

/**
 * Parses a flight number. When `defaultCarrier` is given, a bare number ("117") is accepted and
 * attached to that carrier, which is how the manual trip form stores it.
 */
export function parseFlightNumber(raw: unknown, defaultCarrier?: string | null): ParsedFlightNumber {
  const text = normalizeFlightInput(raw);
  if (!text) return { ok: false, issue: "empty", message: describeFlightNumberIssue("empty") };
  const bad: ParsedFlightNumber = { ok: false, issue: "format", message: describeFlightNumberIssue("format", raw) };

  let carrier: string;
  let rest: string;
  if (NUMBER_ONLY.test(text)) {
    const c = normalizeFlightInput(defaultCarrier ?? "");
    if (!isAirlineCode(c)) return bad;
    carrier = c;
    rest = text;
  } else {
    const m = FULL.exec(text);
    if (!m || !isAirlineCode(m[1])) return bad;
    carrier = m[1];
    rest = m[2];
  }
  const number = stripZeros(rest);
  if (!number) return bad;
  return { ok: true, carrier, carrierKind: carrierKindOf(carrier), number, flightNumber: `${carrier}${number}` };
}

/** True for anything `parseFlightNumber` accepts, with or without an airline prefix. */
export function looksLikeFlightNumber(raw: unknown): boolean {
  const text = normalizeFlightInput(raw);
  return NUMBER_ONLY.test(text) ? stripZeros(text) !== null : parseFlightNumber(text).ok;
}
