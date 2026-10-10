/**
 * Regulation parameters as data. Change numbers here, not in components.
 * Every value carries the source it comes from so it can be re-checked.
 */

export type Band = { maxKm: number; amount: number; label: string };

export type CompensationRegime = {
  id: "EU261" | "UK261";
  name: string;
  currency: "EUR" | "GBP";
  citation: string;
  url: string;
  /** Minimum arrival delay at final destination for compensation (Sturgeon, C-402/07 and C-432/07). */
  delayThresholdMinutes: number;
  bands: Band[];
  /** Flights within the territory longer than 1,500 km are paid at this amount (Art. 7(1)(b)). */
  intraTerritoryLongAmount: number;
  /** Airlines may halve compensation on long flights outside the territory when the delay is under this many minutes. */
  longHaulReduction: { minKm: number; belowMinutes: number; factor: number; citation: string };
  /** Cancellations announced at least this many days ahead do not attract compensation (Art. 5(1)(c)(i)). */
  cancellationNoticeDays: number;
  notes: string[];
};

export const EU261: CompensationRegime = {
  id: "EU261",
  name: "EU Regulation 261/2004",
  currency: "EUR",
  citation: "Regulation (EC) No 261/2004, Articles 4, 5, 6 and 7",
  url: "https://eur-lex.europa.eu/eli/reg/2004/261/oj",
  delayThresholdMinutes: 180,
  bands: [
    { maxKm: 1500, amount: 250, label: "up to 1,500 km" },
    { maxKm: 3500, amount: 400, label: "1,500 to 3,500 km" },
    { maxKm: Number.POSITIVE_INFINITY, amount: 600, label: "over 3,500 km" },
  ],
  intraTerritoryLongAmount: 400,
  longHaulReduction: {
    minKm: 3500,
    belowMinutes: 240,
    factor: 0.5,
    citation: "Art. 7(2)(c) as applied to delays in Sturgeon (C-402/07), para. 63",
  },
  cancellationNoticeDays: 14,
  notes: [
    "A revised regulation was agreed in 2026. It keeps the 3-hour threshold and the €250/€400/€600 amounts and is expected to apply from the second half of 2027. Flights disrupted today fall under the current rules.",
  ],
};

export const UK261: CompensationRegime = {
  id: "UK261",
  name: "UK Regulation 261/2004 (retained)",
  currency: "GBP",
  citation:
    "Regulation (EC) No 261/2004 as retained in UK law and amended by The Air Passenger Rights and Air Travel Organisers' Licensing (Amendment) (EU Exit) Regulations 2019",
  url: "https://www.legislation.gov.uk/eur/2004/261/contents",
  delayThresholdMinutes: 180,
  bands: [
    { maxKm: 1500, amount: 220, label: "up to 1,500 km" },
    { maxKm: 3500, amount: 350, label: "1,500 to 3,500 km" },
    { maxKm: Number.POSITIVE_INFINITY, amount: 520, label: "over 3,500 km" },
  ],
  intraTerritoryLongAmount: 350,
  longHaulReduction: {
    minKm: 3500,
    belowMinutes: 240,
    factor: 0.5,
    citation: "Art. 7(2)(c) as applied to delays (Sturgeon, C-402/07, retained case law)",
  },
  cancellationNoticeDays: 14,
  notes: [],
};

/**
 * Arrival time is measured when at least one door opens (Germanwings, C-452/13).
 * Runway and ADS-B times are earlier than that, so results close to the threshold
 * based on them are sent to review instead of being decided automatically.
 */
export const THRESHOLD_UNCERTAINTY_MINUTES = { below: 15, above: 15 };

export type CauseKey =
  | "unknown"
  | "technical"
  | "crew"
  | "overbooking"
  | "weather"
  | "air_traffic_control"
  | "security"
  | "strike_airline"
  | "strike_external"
  | "other";

export const CAUSES: Record<
  CauseKey,
  { label: string; extraordinary: "no" | "likely" | "unclear"; explanation: string }
> = {
  unknown: {
    label: "Not told / unknown",
    extraordinary: "no",
    explanation:
      "If the airline wants to avoid paying, it has to prove extraordinary circumstances. Ask it in writing for the reason.",
  },
  technical: {
    label: "Technical problem",
    extraordinary: "no",
    explanation:
      "Technical problems found during maintenance or operation are normally within the airline's control (Wallentin-Hermann, C-549/07). Rare exceptions exist, such as hidden manufacturing defects.",
  },
  crew: {
    label: "Crew shortage or crew illness",
    extraordinary: "no",
    explanation: "Staffing is normally part of the airline's own operations, so it is usually not an extraordinary circumstance.",
  },
  overbooking: {
    label: "Overbooking",
    extraordinary: "no",
    explanation: "Overbooking is a commercial decision by the airline.",
  },
  strike_airline: {
    label: "Strike by the airline's own staff",
    extraordinary: "no",
    explanation:
      "A strike called by the airline's own staff is not an extraordinary circumstance (Airhelp v SAS, C-28/20).",
  },
  weather: {
    label: "Weather",
    extraordinary: "likely",
    explanation:
      "Severe weather that makes the flight unsafe is usually an extraordinary circumstance. Whether it applies depends on the actual conditions, so this needs review.",
  },
  air_traffic_control: {
    label: "Air traffic control restrictions",
    extraordinary: "likely",
    explanation:
      "Air traffic management decisions are usually extraordinary circumstances. The airline must still show it took all reasonable measures.",
  },
  security: {
    label: "Security risk",
    extraordinary: "likely",
    explanation: "Security risks are listed as extraordinary circumstances in Recital 14 of the regulation.",
  },
  strike_external: {
    label: "Strike outside the airline (airport, ATC)",
    extraordinary: "likely",
    explanation: "Strikes by third parties such as air traffic controllers or airport staff are usually extraordinary circumstances.",
  },
  other: {
    label: "Other reason",
    extraordinary: "unclear",
    explanation: "We can't classify this reason automatically.",
  },
};

/** United States: no cash compensation for delays; refunds and denied-boarding compensation only. */
export const US_DOT = {
  refundThresholdMinutes: { domestic: 180, international: 360 },
  refundCitation: "14 CFR Part 260 (refunds for cancelled or significantly changed flights)",
  refundUrl: "https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-260",
  deniedBoarding: {
    citation: "14 CFR Part 250 (oversales)",
    url: "https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-250",
    /** Late arrival bands for involuntary denied boarding, domestic / international, in minutes. */
    domesticBands: { lowMin: 60, highMin: 120 },
    internationalBands: { lowMin: 60, highMin: 240 },
    lowMultiple: 2,
    highMultiple: 4,
    /** Caps are inflation-adjusted every two years. Verify before relying on them. */
    capsUsd: { low: 1075, high: 2150 },
    capsNote: "DOT caps as last published; they are adjusted for inflation every two years.",
  },
};

/** Montreal Convention 1999: baggage. */
export const MONTREAL = {
  citation: "Convention for the Unification of Certain Rules for International Carriage by Air (Montreal, 1999)",
  url: "https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:22001A0718(01)",
  damageNoticeDays: 7, // Art. 31(2)
  delayNoticeDays: 21, // Art. 31(2)
  deemedLostAfterDays: 21, // Art. 17(3)
  limitationYears: 2, // Art. 35
  /** Liability limit per passenger for baggage, in Special Drawing Rights (Art. 22(2), revised by ICAO). */
  liabilityLimitSdr: 1519,
  liabilityLimitNote:
    "1,519 SDR per passenger following the 2024 ICAO revision. Verify the current figure, and check the SDR exchange rate at imf.org.",
};

export const BAG_FEE_REFUND_US = {
  citation: "49 U.S.C. 42305 and 14 CFR Part 260 (bag fee refunds)",
  domesticHours: 12,
  internationalShortHaulHours: 15,
  internationalLongHaulHours: 30,
  note: "Applies to US flights when a checked bag is significantly delayed and you filed a mishandled baggage report.",
};
