import { describe, expect, it } from "vitest";
import { tripInput } from "@/lib/validation";
import { tripFieldsFromInput } from "@/lib/trips";
import { HttpError } from "@/lib/errors";
import { callsignFor, canonicalCarrier, scheduleQueryCandidates, splitFlightNumber } from "@/lib/reference";

const base = {
  flightDate: "2026-10-11",
  origin: "GDL",
  destination: "FRA",
  departureTime: "02:35",
  arrivalDate: "2026-10-11",
  arrivalTime: "21:35",
  passengerName: "A Traveller",
};
const fields = (airline: string, flightNumber: string) => tripFieldsFromInput(tripInput.parse({ ...base, airline, flightNumber }));

describe("trip validation accepts the same flight numbers as the lookup", () => {
  it("stores an ICAO-coded flight the airline table does not know (GEC8225)", () => {
    const f = fields("GEC", "8225");
    expect([f.airline, f.flightNumber, f.airlineName]).toEqual(["GEC", "GEC8225", "GEC"]);
    const full = fields("gec", " gec 8225 ");
    expect(full.flightNumber).toBe("GEC8225");
  });

  it("stores a known ICAO code under its IATA code, so BAW and BA are one airline", () => {
    for (const [airline, number] of [["BAW", "117"], ["BA", "BAW117"], ["ba", "ba 117"], ["BAW", "BA117"], ["BA", "0117"]]) {
      const f = fields(airline, number);
      expect([f.airline, f.flightNumber, f.airlineName]).toEqual(["BA", "BA117", "British Airways"]);
    }
  });

  it("keeps working for ordinary 2-character codes", () => {
    expect(fields("AA", "100").flightNumber).toBe("AA100");
    expect(fields("3U", "3U8888").flightNumber).toBe("3U8888");
    expect(fields("UA", "ua 1234").flightNumber).toBe("UA1234");
  });

  it("rejects an airline that does not match the number's own airline", () => {
    expect(() => fields("DL", "BA117")).toThrow(HttpError);
    expect(() => fields("DL", "BA117")).toThrow(/doesn't match airline DL/);
  });

  it.each(["", "BA", "BA12345", "hello", "12345", "0"])("rejects flight number %j", (flightNumber) => {
    expect(tripInput.safeParse({ ...base, airline: "BA", flightNumber }).success).toBe(false);
  });

  it.each(["", "B", "ABCD", "12"])("rejects airline %j", (airline) => {
    expect(tripInput.safeParse({ ...base, airline, flightNumber: "117" }).success).toBe(false);
  });

  it("gives a flight-number-specific message", () => {
    const r = tripInput.safeParse({ ...base, airline: "BA", flightNumber: "BA12345" });
    expect(!r.success && r.error.issues[0].message).toMatch(/flight number/);
  });
});

describe("reference helpers with ICAO codes", () => {
  it("splitFlightNumber", () => {
    expect(splitFlightNumber("GEC8225")).toEqual({ airline: "GEC", number: "8225" });
    expect(splitFlightNumber("gec 0825")).toEqual({ airline: "GEC", number: "825" });
    expect(splitFlightNumber("nonsense")).toBeNull();
  });
  it("canonicalCarrier", () => {
    expect([canonicalCarrier("BAW"), canonicalCarrier("ba"), canonicalCarrier("gec"), canonicalCarrier("3U")]).toEqual(["BA", "BA", "GEC", "3U"]);
  });
  it("scheduleQueryCandidates tries the IATA spelling first and never invents one", () => {
    expect(scheduleQueryCandidates("BAW117")).toEqual(["BA117", "BAW117"]);
    expect(scheduleQueryCandidates("BA117")).toEqual(["BA117"]);
    expect(scheduleQueryCandidates("GEC8225")).toEqual(["GEC8225"]);
    expect(scheduleQueryCandidates("bad")).toEqual([]);
  });
  it("callsignFor", () => {
    expect(callsignFor("BA117")).toBe("BAW117");
    expect(callsignFor("GEC8225")).toBe("GEC8225");
  });
});
