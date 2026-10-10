/** Country sets used for coverage. ISO 3166-1 alpha-2 codes, as in data/airports.json. */

/** EU member states plus outermost regions that carry their own ISO codes (they are EU territory). */
export const EU_MEMBER_STATES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // Outermost regions with separate ISO codes: Guadeloupe, Martinique, French Guiana, Réunion, Mayotte, Saint-Martin.
  // (Canary Islands, Azores and Madeira are coded ES/PT already.)
  "GP", "MQ", "GF", "RE", "YT", "MF",
]);

/** EU261 also applies in Iceland, Norway, Liechtenstein (EEA Agreement) and Switzerland (EU–Swiss air transport agreement). */
export const EU261_TERRITORY = new Set([...EU_MEMBER_STATES, "IS", "NO", "LI", "CH"]);

export const UK261_TERRITORY = new Set(["GB"]);

export const US_TERRITORY = new Set(["US", "PR", "VI", "GU", "AS", "MP"]);

export type CarrierRegion = "eu" | "uk" | "other";

/** Infer whether an airline counts as an EU/EEA/Swiss ("Community") carrier or a UK carrier. */
export function carrierRegionFromCountry(country: string | null | undefined): CarrierRegion {
  if (!country) return "other";
  if (EU261_TERRITORY.has(country)) return "eu";
  if (UK261_TERRITORY.has(country)) return "uk";
  return "other";
}
