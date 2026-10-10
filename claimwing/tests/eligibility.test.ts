import { describe, expect, it } from "vitest";
import { bandFor, evaluateBaggage, evaluateFlight, type AirportInput, type FlightInput } from "@/lib/rules/engine";
import { EU261, UK261 } from "@/lib/rules/config";
import { greatCircleKm } from "@/lib/rules/geo";

const A: Record<string, AirportInput> = {
  LHR: { iata: "LHR", country: "GB", lat: 51.47075, lon: -0.45991 },
  CDG: { iata: "CDG", country: "FR", lat: 49.00896, lon: 2.55412 },
  FRA: { iata: "FRA", country: "DE", lat: 50.02671, lon: 8.55835 },
  MAD: { iata: "MAD", country: "ES", lat: 40.47193, lon: -3.56264 },
  ATH: { iata: "ATH", country: "GR", lat: 37.9364, lon: 23.94445 },
  TFS: { iata: "TFS", country: "ES", lat: 28.0445, lon: -16.5725 },
  RUN: { iata: "RUN", country: "RE", lat: -20.8871, lon: 55.5103 },
  JFK: { iata: "JFK", country: "US", lat: 40.63945, lon: -73.77932 },
  EWR: { iata: "EWR", country: "US", lat: 40.6894, lon: -74.17055 },
  LAX: { iata: "LAX", country: "US", lat: 33.9425, lon: -118.408 },
  DXB: { iata: "DXB", country: "AE", lat: 25.24979, lon: 55.37099 },
  ZRH: { iata: "ZRH", country: "CH", lat: 47.4647, lon: 8.54917 },
};

function flight(over: Partial<FlightInput>): FlightInput {
  return {
    origin: A.CDG,
    destination: A.FRA,
    airlineCountry: "FR",
    disruption: "delay",
    arrivalDelayMinutes: 200,
    delayEvidenceKind: "gate_arrival",
    cause: "technical",
    ...over,
  };
}

const eu = (r: ReturnType<typeof evaluateFlight>) => r.results.find((x) => x.regime === "EU261")!;
const uk = (r: ReturnType<typeof evaluateFlight>) => r.results.find((x) => x.regime === "UK261")!;
const us = (r: ReturnType<typeof evaluateFlight>) => r.results.find((x) => x.regime === "US_DOT")!;

describe("distance bands", () => {
  it("pays EU261 €250 / €400 / €600 at the band edges", () => {
    expect(bandFor(EU261, 1500, false).amount).toBe(250);
    expect(bandFor(EU261, 1500.01, false).amount).toBe(400);
    expect(bandFor(EU261, 3500, false).amount).toBe(400);
    expect(bandFor(EU261, 3500.01, false).amount).toBe(600);
  });

  it("pays UK261 £220 / £350 / £520", () => {
    expect(bandFor(UK261, 800, false).amount).toBe(220);
    expect(bandFor(UK261, 2000, false).amount).toBe(350);
    expect(bandFor(UK261, 6000, false).amount).toBe(520);
  });

  it("caps flights within the territory over 1,500 km at the middle amount", () => {
    expect(bandFor(EU261, 9000, true).amount).toBe(400);
    expect(bandFor(EU261, 1200, true).amount).toBe(250);
  });

  it("computes realistic great-circle distances", () => {
    expect(Math.round(greatCircleKm(A.LHR, A.CDG))).toBeGreaterThan(330);
    expect(Math.round(greatCircleKm(A.LHR, A.CDG))).toBeLessThan(360);
    expect(greatCircleKm(A.CDG, A.JFK)).toBeGreaterThan(5700);
  });

  it("short flight inside the EU: €250", () => {
    const r = evaluateFlight(flight({ origin: A.CDG, destination: A.FRA }));
    expect(eu(r).status).toBe("eligible");
    expect(eu(r).amount).toBe(250);
  });

  it("medium flight inside the EU: €400", () => {
    const r = evaluateFlight(flight({ origin: A.FRA, destination: A.ATH }));
    expect(r.distanceKm).toBeGreaterThan(1500);
    expect(eu(r).amount).toBe(400);
  });

  it("Paris to Réunion is intra-EU, so €400 not €600", () => {
    const r = evaluateFlight(flight({ origin: A.CDG, destination: A.RUN, arrivalDelayMinutes: 300 }));
    expect(r.distanceKm).toBeGreaterThan(3500);
    expect(eu(r).amount).toBe(400);
    expect(eu(r).minAmount).toBeNull();
  });

  it("long flight leaving the EU: €600, reducible to €300 between 3 and 4 hours", () => {
    const r = evaluateFlight(flight({ origin: A.CDG, destination: A.JFK, arrivalDelayMinutes: 210 }));
    expect(eu(r).amount).toBe(600);
    expect(eu(r).minAmount).toBe(300);
    const r2 = evaluateFlight(flight({ origin: A.CDG, destination: A.JFK, arrivalDelayMinutes: 240 }));
    expect(eu(r2).minAmount).toBeNull();
  });
});

describe("the 3-hour threshold", () => {
  it("exactly 3 hours at the gate is eligible", () => {
    const r = evaluateFlight(flight({ arrivalDelayMinutes: 180, delayEvidenceKind: "gate_arrival" }));
    expect(eu(r).status).toBe("eligible");
  });

  it("2 h 59 at the gate is not eligible", () => {
    const r = evaluateFlight(flight({ arrivalDelayMinutes: 179, delayEvidenceKind: "gate_arrival" }));
    expect(eu(r).status).toBe("not_eligible");
  });

  it("manual arrival times are treated as precise", () => {
    const r = evaluateFlight(flight({ arrivalDelayMinutes: 181, delayEvidenceKind: "manual_arrival" }));
    expect(eu(r).status).toBe("eligible");
  });

  it("runway or ADS-B times near 3 hours go to review, not a decision", () => {
    for (const kind of ["runway_arrival", "adsb_on_ground", "adsb_last_contact"] as const) {
      expect(eu(evaluateFlight(flight({ arrivalDelayMinutes: 172, delayEvidenceKind: kind }))).status).toBe("needs_review");
      expect(eu(evaluateFlight(flight({ arrivalDelayMinutes: 185, delayEvidenceKind: kind }))).status).toBe("needs_review");
    }
  });

  it("runway delays clearly over the threshold are eligible", () => {
    expect(eu(evaluateFlight(flight({ arrivalDelayMinutes: 230, delayEvidenceKind: "runway_arrival" }))).status).toBe("eligible");
  });

  it("missing arrival time needs review", () => {
    expect(eu(evaluateFlight(flight({ arrivalDelayMinutes: null }))).status).toBe("needs_review");
  });
});

describe("coverage", () => {
  it("US domestic flights are not covered by EU or UK rules", () => {
    const r = evaluateFlight(flight({ origin: A.EWR, destination: A.LAX, airlineCountry: "US", arrivalDelayMinutes: 400 }));
    expect(eu(r).applies).toBe(false);
    expect(uk(r).applies).toBe(false);
    expect(us(r).applies).toBe(true);
    expect(us(r).kind).toBe("refund");
  });

  it("non-EU airline flying into the EU is not covered by EU261", () => {
    const r = evaluateFlight(flight({ origin: A.JFK, destination: A.CDG, airlineCountry: "US", arrivalDelayMinutes: 300 }));
    expect(eu(r).applies).toBe(false);
    expect(eu(r).status).toBe("not_eligible");
  });

  it("EU airline flying into the EU is covered", () => {
    const r = evaluateFlight(flight({ origin: A.JFK, destination: A.CDG, airlineCountry: "FR", arrivalDelayMinutes: 300 }));
    expect(eu(r).applies).toBe(true);
    expect(eu(r).amount).toBe(600);
  });

  it("any airline departing the EU is covered", () => {
    const r = evaluateFlight(flight({ origin: A.FRA, destination: A.DXB, airlineCountry: "AE", arrivalDelayMinutes: 300 }));
    expect(eu(r).applies).toBe(true);
  });

  it("flights between two non-covered countries are not covered at all", () => {
    const r = evaluateFlight(flight({ origin: A.DXB, destination: A.JFK, airlineCountry: "AE", arrivalDelayMinutes: 500 }));
    expect(eu(r).applies).toBe(false);
    expect(uk(r).applies).toBe(false);
    expect(r.primary?.status).not.toBe("eligible");
  });

  it("Swiss departures are covered by EU261", () => {
    expect(eu(evaluateFlight(flight({ origin: A.ZRH, destination: A.JFK, airlineCountry: "US", arrivalDelayMinutes: 300 }))).applies).toBe(true);
  });

  it("UK departures are covered by UK261 in pounds", () => {
    const r = evaluateFlight(flight({ origin: A.LHR, destination: A.JFK, airlineCountry: "US", arrivalDelayMinutes: 300 }));
    expect(uk(r).applies).toBe(true);
    expect(uk(r).amount).toBe(520);
    expect(uk(r).currency).toBe("GBP");
    expect(eu(r).applies).toBe(false);
  });

  it("EU airline from the UK to the EU: both regimes apply, with a note to claim once", () => {
    const r = evaluateFlight(flight({ origin: A.LHR, destination: A.CDG, airlineCountry: "FR", arrivalDelayMinutes: 200 }));
    expect(eu(r).applies).toBe(true);
    expect(uk(r).applies).toBe(true);
    expect(eu(r).explanation.join(" ")).toMatch(/only be compensated once/);
  });

  it("UK airline into the EU from outside is not EU261", () => {
    const r = evaluateFlight(flight({ origin: A.JFK, destination: A.CDG, airlineCountry: "GB", arrivalDelayMinutes: 300 }));
    expect(eu(r).applies).toBe(false);
  });

  it("respects the operating carrier override", () => {
    const r = evaluateFlight(
      flight({ origin: A.JFK, destination: A.CDG, airlineCountry: "US", operatingCarrierRegion: "eu", arrivalDelayMinutes: 300 }),
    );
    expect(eu(r).applies).toBe(true);
  });
});

describe("causes, cancellations and denied boarding", () => {
  it("weather and security are sent to review", () => {
    expect(eu(evaluateFlight(flight({ cause: "weather" }))).status).toBe("needs_review");
    expect(eu(evaluateFlight(flight({ cause: "security" }))).status).toBe("needs_review");
  });

  it("technical problems and airline strikes stay eligible", () => {
    expect(eu(evaluateFlight(flight({ cause: "technical" }))).status).toBe("eligible");
    expect(eu(evaluateFlight(flight({ cause: "strike_airline" }))).status).toBe("eligible");
  });

  it("cancellation with 14+ days notice is not eligible", () => {
    expect(eu(evaluateFlight(flight({ disruption: "cancellation", cancellationNoticeDays: 14 }))).status).toBe("not_eligible");
  });

  it("cancellation with short notice and no rerouting is eligible", () => {
    const r = eu(evaluateFlight(flight({ disruption: "cancellation", cancellationNoticeDays: 2, reroutingOffered: false })));
    expect(r.status).toBe("eligible");
    expect(r.amount).toBe(250);
  });

  it("cancellation with rerouting offered needs review", () => {
    expect(eu(evaluateFlight(flight({ disruption: "cancellation", cancellationNoticeDays: 3, reroutingOffered: true }))).status).toBe("needs_review");
  });

  it("involuntary denied boarding is eligible regardless of delay", () => {
    expect(eu(evaluateFlight(flight({ disruption: "denied_boarding", deniedBoardingVoluntary: false, arrivalDelayMinutes: 10 }))).status).toBe("eligible");
  });

  it("US involuntary denied boarding uses fare multiples with caps", () => {
    const r = us(
      evaluateFlight(
        flight({ origin: A.EWR, destination: A.LAX, airlineCountry: "US", disruption: "denied_boarding", deniedBoardingVoluntary: false, arrivalDelayMinutes: 150, ticketPrice: { amount: 300, currency: "USD" } }),
      ),
    );
    expect(r.status).toBe("eligible");
    expect(r.amount).toBe(1200);
  });
});

describe("baggage deadlines (Montreal Convention)", () => {
  const base = { sdrRate: 1.36, sdrCurrency: "USD", originCountry: "FR", destinationCountry: "US" };

  it("damaged bag: written complaint within 7 days of receipt", () => {
    const r = evaluateBaggage({ ...base, status: "arrived_damaged", receivedAt: "2026-10-01T12:00:00Z" });
    const d = r.deadlines.find((x) => x.kind === "damage_notice")!;
    expect(d.dueAt).toBe("2026-10-08T12:00:00.000Z");
    expect(r.status).toBe("eligible");
  });

  it("delayed bag: 21 days after delivery", () => {
    const r = evaluateBaggage({ ...base, status: "delayed", reportedMissingAt: "2026-10-01T12:00:00Z", deliveredAt: "2026-10-03T12:00:00Z" });
    expect(r.deadlines.find((x) => x.kind === "delay_notice")!.dueAt).toBe("2026-10-24T12:00:00.000Z");
  });

  it("missing bag: deemed lost after 21 days", () => {
    const r = evaluateBaggage({ ...base, status: "delayed", reportedMissingAt: "2026-10-01T12:00:00Z" });
    expect(r.deadlines.find((x) => x.kind === "deemed_lost")!.dueAt).toBe("2026-10-22T12:00:00.000Z");
  });

  it("warns when the declared value is above the liability limit", () => {
    const r = evaluateBaggage({ ...base, status: "lost", estimatedValue: { amount: 5000, currency: "USD" }, arrivalDate: "2026-10-01T00:00:00Z" });
    expect(r.limitLocal).toBe(Math.round(1519 * 1.36));
    expect(r.overLimit).toBe(true);
  });

  it("domestic flights fall outside the convention", () => {
    const r = evaluateBaggage({ ...base, destinationCountry: "FR", status: "arrived_damaged", receivedAt: "2026-10-01T12:00:00Z" });
    expect(r.convention).toBe("domestic");
    expect(r.status).toBe("needs_review");
  });
});
