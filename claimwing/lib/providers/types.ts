/** A single aircraft position report, normalised to SI units. */
export type PositionReport = {
  observedAt: Date;
  lat: number;
  lon: number;
  altitude: number | null; // meters (barometric)
  velocity: number | null; // m/s over ground
  track: number | null; // degrees
  verticalRate: number | null; // m/s
  onGround: boolean;
  icao24: string;
  callsign: string | null;
  registration?: string | null;
  aircraftType?: string | null;
  source: string;
  raw?: unknown;
};

export type NormalizedStatus = "scheduled" | "in_air" | "landed" | "cancelled" | "diverted" | "unknown";

/** Schedule and actual times for one flight leg, from a schedule API. All Dates are UTC instants. */
export type ScheduleInfo = {
  source: string;
  status: string | null;
  normalizedStatus: NormalizedStatus;
  origin: string | null;
  destination: string | null;
  scheduledDeparture: Date | null;
  scheduledArrival: Date | null;
  gateDeparture: Date | null; // actual off-block, when known
  runwayDeparture: Date | null;
  gateArrival: Date | null; // actual on-block, when known
  runwayArrival: Date | null;
  estimatedArrival: Date | null;
  icao24: string | null;
  registration: string | null;
  callsign: string | null;
  aircraftModel: string | null;
  notes: string[];
};

/**
 * The provider interface from the spec. A provider can supply live positions,
 * schedule/actual times, or both (the replay provider does both).
 */
export interface FlightDataProvider {
  readonly name: string;
  readonly kind: "adsb" | "schedule" | "replay";
  getPositionByIcao24?(icao24: string): Promise<PositionReport | null>;
  getPositionByCallsign?(callsign: string): Promise<PositionReport | null>;
  getSchedule?(flightNumber: string, dateLocal: string, origin?: string, destination?: string): Promise<ScheduleInfo | null>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(`${provider}: ${message}`);
  }
}
