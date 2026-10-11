import { describe, expect, it } from "vitest";
import { createLatestGate } from "@/lib/latest-gate";
import { isAirlineCode, looksLikeFlightNumber, normalizeFlightInput, parseFlightNumber } from "@/lib/flight-number";

const ok = (raw: unknown, carrier?: string) => {
  const p = parseFlightNumber(raw, carrier);
  if (!p.ok) throw new Error(`expected ${JSON.stringify(raw)} to parse: ${p.message}`);
  return p;
};

describe("parseFlightNumber: valid flight numbers", () => {
  it.each([
    ["AA100", "AA", "100"],
    ["UA1234", "UA", "1234"],
    ["DL456", "DL", "456"],
    ["BA117", "BA", "117"],
    ["3U8888", "3U", "8888"],
    ["U28013", "U2", "8013"],
    ["B6123", "B6", "123"],
    ["0B100", "0B", "100"],
    ["AA1234B", "AA", "1234B"],
  ])("accepts IATA %s", (raw, carrier, number) => {
    const p = ok(raw);
    expect([p.carrier, p.number, p.carrierKind]).toEqual([carrier, number, "iata"]);
  });

  // The reported bug: GEC8225 (Lufthansa Cargo) was rejected because only 2-character airline codes were allowed.
  it.each([
    ["GEC8225", "GEC", "8225"],
    ["BAW117", "BAW", "117"],
    ["AAL100", "AAL", "100"],
    ["UAL1234", "UAL", "1234"],
    ["EZY8013", "EZY", "8013"],
  ])("accepts ICAO %s", (raw, carrier, number) => {
    const p = ok(raw);
    expect([p.carrier, p.number, p.carrierKind]).toEqual([carrier, number, "icao"]);
    expect(p.flightNumber).toBe(raw);
  });

  it.each([
    ["ba117", "BA117"],
    ["gec8225", "GEC8225"],
    ["  BA117  ", "BA117"],
    ["BA 117", "BA117"],
    ["b a 1 1 7", "BA117"],
    ["gec 8225", "GEC8225"],
    ["U2 8013", "U28013"],
    ["BA-117", "BA117"],
    ["BA 117", "BA117"],
    ["\tBA117\n", "BA117"],
    ["BA0117", "BA117"],
    ["ＢＡ１１７", "BA117"],
  ])("normalises %j to %s", (raw, expected) => {
    expect(ok(raw).flightNumber).toBe(expected);
  });

  it("accepts a bare number when the airline is known", () => {
    expect(ok("117", "BA").flightNumber).toBe("BA117");
    expect(ok("8225", "gec").flightNumber).toBe("GEC8225");
  });
});

describe("parseFlightNumber: rejections", () => {
  it.each(["", "   ", null, undefined, 42])("treats %j as empty", (raw) => {
    const p = parseFlightNumber(raw);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.issue).toBe("empty");
  });

  it.each(["BA", "117", "12345", "BA12345", "BA0", "BA0000", "B", "GEC", "GECX8225", "BA117!!", "A@117", "BA1.17", "ABCD1234", "117BA"])("rejects %j as a bad format", (raw) => {
    const p = parseFlightNumber(raw);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.issue).toBe("format");
  });

  it("does not need an airline for a bare number unless one is supplied", () => {
    expect(parseFlightNumber("117").ok).toBe(false);
    expect(parseFlightNumber("117", "1").ok).toBe(false);
    expect(parseFlightNumber("117", "12").ok).toBe(false);
  });

  it("never tells someone who typed something to 'enter a flight number'", () => {
    const empty = parseFlightNumber("");
    const bad = parseFlightNumber("BA12345");
    expect(!empty.ok && empty.message).toMatch(/^Enter your flight number/);
    expect(!bad.ok && bad.message).not.toMatch(/^Enter/);
    expect(!bad.ok && bad.message).toContain("BA12345");
    expect(!bad.ok && bad.message).toMatch(/doesn't look like a flight number/);
  });
});

describe("helpers", () => {
  it("normalizeFlightInput", () => {
    expect(normalizeFlightInput(" ba 117 ")).toBe("BA117");
    expect(normalizeFlightInput(undefined)).toBe("");
  });
  it("isAirlineCode needs a letter in a 2-character code", () => {
    expect([isAirlineCode("BA"), isAirlineCode("3U"), isAirlineCode("0B"), isAirlineCode("gec"), isAirlineCode("12"), isAirlineCode("B"), isAirlineCode("ABCD"), isAirlineCode("A1B")]).toEqual([true, true, true, true, false, false, false, false]);
  });
  it("looksLikeFlightNumber accepts both full and bare forms", () => {
    expect([looksLikeFlightNumber("117"), looksLikeFlightNumber("BA117"), looksLikeFlightNumber("gec 8225"), looksLikeFlightNumber("0"), looksLikeFlightNumber("hello")]).toEqual([true, true, true, false, false]);
  });
});

describe("createLatestGate", () => {
  it("lets only the newest request apply its result", () => {
    const gate = createLatestGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });
  it("invalidate makes in-flight requests stale (input changed while waiting)", () => {
    const gate = createLatestGate();
    const t = gate.begin();
    gate.invalidate();
    expect(gate.isCurrent(t)).toBe(false);
    expect(gate.isCurrent(gate.begin())).toBe(true);
  });
});
