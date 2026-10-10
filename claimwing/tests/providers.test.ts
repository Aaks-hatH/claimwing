import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/providers/cache", () => ({
  cached: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
  spaced: async () => undefined,
}));

import { parseUtcish, AeroDataBoxProvider } from "@/lib/providers/schedule";
import { AirplanesLiveProvider } from "@/lib/providers/adsb";
import { replayPosition, replaySchedule, type ReplayFile } from "@/lib/providers/replay";
import { chooseArrival } from "@/lib/flight-tracker";
import { callsignFor, splitFlightNumber } from "@/lib/reference";
import { localToUtc } from "@/lib/time";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AERODATABOX_RAPIDAPI_KEY;
});

describe("time parsing", () => {
  it("parses AeroDataBox-style UTC strings", () => {
    expect(parseUtcish("2026-10-10 14:05Z")?.toISOString()).toBe("2026-10-10T14:05:00.000Z");
    expect(parseUtcish("2026-10-10 15:05+01:00")?.toISOString()).toBe("2026-10-10T14:05:00.000Z");
    expect(parseUtcish("2026-10-10T14:05:00")?.toISOString()).toBe("2026-10-10T14:05:00.000Z");
    expect(parseUtcish("nonsense")).toBeNull();
    expect(parseUtcish(undefined)).toBeNull();
  });

  it("converts local airport times to UTC, including DST", () => {
    expect(localToUtc("2026-10-12", "08:00", "America/New_York")?.toISOString()).toBe("2026-10-12T12:00:00.000Z");
    expect(localToUtc("2026-12-12", "08:00", "America/New_York")?.toISOString()).toBe("2026-12-12T13:00:00.000Z");
    expect(localToUtc("2026-07-01", "10:20", "Europe/London")?.toISOString()).toBe("2026-07-01T09:20:00.000Z");
  });
});

describe("flight numbers and callsigns", () => {
  it("splits flight numbers", () => {
    expect(splitFlightNumber("BA117")).toEqual({ airline: "BA", number: "117" });
    expect(splitFlightNumber("ba 0117")).toEqual({ airline: "BA", number: "117" });
    expect(splitFlightNumber("3U8888")).toEqual({ airline: "3U", number: "8888" });
  });
  it("derives ICAO callsigns", () => {
    expect(callsignFor("BA117")).toBe("BAW117");
    expect(callsignFor("UA1")).toBe("UAL1");
  });
});

describe("AeroDataBox mapping", () => {
  it("maps an arrived flight to gate and runway evidence", async () => {
    process.env.AERODATABOX_RAPIDAPI_KEY = "k";
    const sample = [
      {
        number: "BA 117",
        status: "Arrived",
        callSign: "BAW117",
        departure: { airport: { iata: "LHR" }, scheduledTime: { utc: "2026-10-10 07:20Z" }, revisedTime: { utc: "2026-10-10 10:38Z" }, runwayTime: { utc: "2026-10-10 10:55Z" } },
        arrival: { airport: { iata: "JFK" }, scheduledTime: { utc: "2026-10-10 15:20Z" }, revisedTime: { utc: "2026-10-10 18:59Z" }, runwayTime: { utc: "2026-10-10 18:50Z" } },
        aircraft: { reg: "G-XWBA", modeS: "400F00", model: "Airbus A350" },
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })));
    const s = await AeroDataBoxProvider.getSchedule!("BA117", "2026-10-10", "LHR", "JFK");
    expect(s?.normalizedStatus).toBe("landed");
    expect(s?.gateArrival?.toISOString()).toBe("2026-10-10T18:59:00.000Z");
    expect(s?.runwayArrival?.toISOString()).toBe("2026-10-10T18:50:00.000Z");
    expect(s?.estimatedArrival).toBeNull();
    expect(s?.icao24).toBe("400f00");
  });

  it("treats a revised time as an estimate before landing", async () => {
    process.env.AERODATABOX_RAPIDAPI_KEY = "k";
    const sample = [
      { status: "EnRoute", departure: { airport: { iata: "LHR" } }, arrival: { airport: { iata: "JFK" }, scheduledTime: { utc: "2026-10-10 15:20Z" }, revisedTime: { utc: "2026-10-10 18:10Z" } } },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })));
    const s = await AeroDataBoxProvider.getSchedule!("BA117", "2026-10-10", "LHR", "JFK");
    expect(s?.normalizedStatus).toBe("in_air");
    expect(s?.gateArrival).toBeNull();
    expect(s?.estimatedArrival?.toISOString()).toBe("2026-10-10T18:10:00.000Z");
  });

  it("returns null when the flight isn't found", async () => {
    process.env.AERODATABOX_RAPIDAPI_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    expect(await AeroDataBoxProvider.getSchedule!("BA117", "2026-10-10")).toBeNull();
  });
});

describe("airplanes.live mapping", () => {
  it("converts feet, knots and ground state", async () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ now, ac: [{ hex: "400f00", flight: "BAW117  ", alt_baro: 36000, gs: 480, track: 270, baro_rate: -1000, lat: 52, lon: -20, seen_pos: 2 }] }), { status: 200 }),
      ),
    );
    const p = await AirplanesLiveProvider.getPositionByIcao24!("400F00");
    expect(p?.callsign).toBe("BAW117");
    expect(p?.onGround).toBe(false);
    expect(Math.round(p!.altitude!)).toBe(10973);
    expect(Math.round(p!.velocity!)).toBe(247);
    expect(p?.observedAt.toISOString()).toBe("2026-10-10T11:59:58.000Z");
  });

  it("recognises aircraft on the ground", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ now: Date.now(), ac: [{ hex: "abc123", alt_baro: "ground", lat: 40.6, lon: -73.7 }] }), { status: 200 })));
    const p = await AirplanesLiveProvider.getPositionByIcao24!("abc123");
    expect(p?.onGround).toBe(true);
    expect(p?.altitude).toBe(0);
  });

  it("returns null when the aircraft isn't visible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ now: Date.now(), ac: [] }), { status: 200 })));
    expect(await AirplanesLiveProvider.getPositionByCallsign!("BAW117")).toBeNull();
  });
});

describe("replay", () => {
  const r: ReplayFile = {
    label: "t",
    synthetic: true,
    flightNumber: "BA117",
    origin: "LHR",
    destination: "JFK",
    icao24: "400f00",
    callsign: "BAW117",
    scheduledDurationMin: 480,
    gateDepartureMin: 200,
    takeoffMin: 215,
    touchdownMin: 690,
    gateArrivalMin: 699,
    cause: "technical",
    points: [
      { t: 200, lat: 51.47, lon: -0.46, alt: 0, gs: 8, trk: 270, vr: 0, gnd: true },
      { t: 215, lat: 51.47, lon: -0.5, alt: 0, gs: 80, trk: 270, vr: 0, gnd: true },
      { t: 450, lat: 50, lon: -40, alt: 11000, gs: 245, trk: 260, vr: 0, gnd: false },
      { t: 690, lat: 40.64, lon: -73.78, alt: 0, gs: 70, trk: 220, vr: 0, gnd: true },
    ],
  };
  const dep = new Date("2026-10-10T07:20:00Z");
  const started = new Date("2026-10-10T10:00:00Z");
  const clock = { scheduledDeparture: dep, startedAt: started, speed: 60, startOffsetMin: 190 };

  it("interpolates position on the compressed clock", () => {
    // 4 real minutes at 60x = 240 flight minutes after offset 190 -> minute 430
    const p = replayPosition(r, clock, new Date(started.getTime() + 4 * 60_000));
    expect(p?.onGround).toBe(false);
    expect(p!.lon).toBeLessThan(-30);
    expect(p?.source).toBe("Demo replay");
  });

  it("reports the schedule as landed after the gate arrival minute", () => {
    const s = replaySchedule(r, clock, new Date(started.getTime() + 9 * 60_000));
    expect(s.normalizedStatus).toBe("landed");
    expect(s.gateArrival?.getTime()).toBe(dep.getTime() + 699 * 60_000);
  });

  it("is not visible before pushback", () => {
    expect(replayPosition(r, clock, started)).toBeNull();
  });
});

describe("arrival evidence priority", () => {
  const t = (iso: string) => new Date(iso);
  it("prefers manual, then gate, then runway, then ADS-B", () => {
    const ev = [
      { kind: "adsb_on_ground" as const, time: t("2026-10-10T18:52:00Z"), source: "ADS-B" },
      { kind: "runway_arrival" as const, time: t("2026-10-10T18:50:00Z"), source: "API" },
      { kind: "gate_arrival" as const, time: t("2026-10-10T18:59:00Z"), source: "API" },
    ];
    expect(chooseArrival(ev)?.kind).toBe("gate_arrival");
    expect(chooseArrival([...ev, { kind: "manual_arrival" as const, time: t("2026-10-10T19:01:00Z"), source: "manual" }])?.kind).toBe("manual_arrival");
    expect(chooseArrival(ev.slice(0, 1))?.kind).toBe("adsb_on_ground");
    expect(chooseArrival([])).toBeNull();
  });
});
