import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cache is bypassed here (its own TTL behaviour is tested separately), so every call reaches the provider.
vi.mock("@/lib/providers/cache", () => ({
  cached: async (_k: string, _t: unknown, fn: () => Promise<unknown>) => fn(),
  spaced: async () => undefined,
}));
// The route's error helper pulls in next-auth, which is irrelevant here.
vi.mock("@/lib/api", async () => {
  const { NextResponse } = await import("next/server");
  return { errorResponse: () => NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 }) };
});
const rate = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: async () => ({ ok: rate.ok, remaining: 0, retryAfter: 120 }),
  clientIp: () => "203.0.113.9",
}));

import { lookupFlight, parseLookupInput, type LookupInput } from "@/lib/flight-lookup";
import { GET } from "@/app/api/flights/lookup/route";

const gecLeg = {
  number: "GEC 8225",
  status: "EnRoute",
  departure: { airport: { iata: "GDL" }, scheduledTime: { utc: "2026-10-11 08:35Z" } },
  arrival: { airport: { iata: "FRA" }, scheduledTime: { utc: "2026-10-11 18:35Z" } },
  aircraft: { reg: "D-ALFA", modeS: "3C6444", model: "Boeing 777F" },
};
const baLeg = {
  number: "BA 117",
  status: "Expected",
  departure: { airport: { iata: "LHR" }, scheduledTime: { utc: "2026-10-12 07:20Z" } },
  arrival: { airport: { iata: "JFK" }, scheduledTime: { utc: "2026-10-12 15:20Z" } },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let calls: string[];
function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (calls.push(String(url)), handler(String(url)))));
}
const input = (flight: string, date = "2026-10-11"): LookupInput => {
  const p = parseLookupInput(flight, date);
  if (!p.ok) throw new Error("bad test input");
  return p.input;
};

beforeEach(() => {
  process.env.AERODATABOX_RAPIDAPI_KEY = "test-key";
  delete process.env.SCHEDULE_PROVIDER;
  rate.ok = true;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.AERODATABOX_RAPIDAPI_KEY;
  delete process.env.SCHEDULE_PROVIDER;
});

describe("parseLookupInput", () => {
  it("accepts lowercase, spaced and padded input", () => {
    for (const raw of ["gec8225", " GEC 8225 ", "gec 8225\n"]) {
      const p = parseLookupInput(raw, "2026-10-11");
      expect(p.ok && p.input.flight.flightNumber).toBe("GEC8225");
    }
  });
  it("reports an empty field and a malformed number differently", () => {
    const empty = parseLookupInput("", "2026-10-11");
    const bad = parseLookupInput("BA12345", "2026-10-11");
    expect(!empty.ok && empty.outcome.body.status).toBe("invalid_format");
    expect(!bad.ok && bad.outcome.body.message).toContain("BA12345");
    expect(!empty.ok && empty.outcome.body.message).not.toBe(!bad.ok && bad.outcome.body.message);
  });
  it("rejects impossible dates", () => {
    for (const d of ["2026-02-31", "2026-13-01", "11/10/2026", "", null]) {
      const p = parseLookupInput("BA117", d);
      expect(p.ok).toBe(false);
      expect(!p.ok && p.outcome.body.status).toBe("invalid_date");
    }
  });
});

describe("lookupFlight", () => {
  it("finds a flight with a 3-letter ICAO code (the reported GEC8225 case)", async () => {
    stubFetch(() => json([gecLeg]));
    const r = await lookupFlight(input("gec8225"));
    expect(r.httpStatus).toBe(200);
    expect(r.body.status).toBe("ok");
    expect(r.body.found).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/flights/number/GEC8225/2026-10-11");
    const options = r.body.options as Array<{ origin: string; destination: string }>;
    expect(options.map((o) => `${o.origin}-${o.destination}`)).toEqual(["GDL-FRA"]);
    expect(r.body.flight).toMatchObject({ airline: "GEC", number: "8225", airlineKnown: false });
  });

  it("asks for the IATA form of a known ICAO code first, and reports the canonical airline", async () => {
    stubFetch(() => json([baLeg]));
    const r = await lookupFlight(input("baw117", "2026-10-12"));
    expect(calls[0]).toContain("/flights/number/BA117/");
    expect(r.body.status).toBe("ok");
    expect(r.body.flight).toMatchObject({ airline: "BA", number: "117", airlineKnown: true });
  });

  it("falls back to the code as typed when the IATA form has no data", async () => {
    stubFetch((url) => (url.includes("/BA117/") ? new Response(null, { status: 404 }) : json([baLeg])));
    const r = await lookupFlight(input("BAW117", "2026-10-12"));
    expect(calls.map((c) => c.match(/number\/(\w+)\//)![1])).toEqual(["BA117", "BAW117"]);
    expect(r.body.status).toBe("ok");
  });

  it("does not claim a flight exists when the provider has no match, and says why", async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    const r = await lookupFlight(input("GEC8225"));
    expect(r.body.found).toBe(false);
    expect(r.body.status).toBe("not_found");
    expect(r.body.message).toContain("couldn't find GEC8225");
    expect(r.body.message).toContain("don't recognise the airline code GEC");
    expect(r.body.options).toBeUndefined();

    const known = await lookupFlight(input("BA117"));
    expect(known.body.status).toBe("not_found");
    expect(known.body.message).not.toContain("recognise");
  });

  it.each([
    ["HTTP 503", () => new Response("down", { status: 503 })],
    ["rate limit", () => new Response("", { status: 429 })],
    ["key rejected", () => new Response("", { status: 403 })],
    ["bad JSON", () => new Response("<html>oops", { status: 200 })],
    ["timeout", () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }))],
    ["network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("reports a provider failure (%s) as a temporary service problem, not a bad flight number", async (_name, handler) => {
    stubFetch(handler as () => Response);
    const r = await lookupFlight(input("GEC8225"));
    expect(r.httpStatus).toBe(200);
    expect(r.body.status).toBe("service_unavailable");
    expect(r.body.retryable).toBe(true);
    expect(r.body.found).toBe(false);
    expect(r.body.message).toContain("Your flight number looks fine");
    expect(r.body.message).not.toMatch(/^Enter/);
    expect(JSON.stringify(r.body)).not.toContain("test-key");
  });

  it("a failed attempt does not poison the next one", async () => {
    let n = 0;
    stubFetch(() => (++n === 1 ? new Response("", { status: 503 }) : json([gecLeg])));
    expect((await lookupFlight(input("GEC8225"))).body.status).toBe("service_unavailable");
    expect((await lookupFlight(input("GEC8225"))).body.status).toBe("ok");
  });

  it("gives the same answer for repeated attempts with different spellings", async () => {
    stubFetch(() => json([gecLeg]));
    const results = [];
    for (const raw of ["GEC8225", "gec8225", " gec 8225 ", "GEC 8225", "Gec-8225"]) {
      const r = await lookupFlight(input(raw));
      results.push([r.body.status, (r.body.options as unknown[]).length, (r.body.flight as { flightNumber: string }).flightNumber]);
    }
    expect(new Set(results.map((r) => r.join("|"))).size).toBe(1);
    expect(results[0]).toEqual(["ok", 1, "GEC8225"]);
  });

  it("reports when no schedule provider is configured", async () => {
    delete process.env.AERODATABOX_RAPIDAPI_KEY;
    stubFetch(() => json([]));
    const r = await lookupFlight(input("BA117"));
    expect(r.body.status).toBe("not_configured");
    expect(r.body.configured).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("treats a leg without times as incomplete data, not as a found flight", async () => {
    stubFetch(() => json([{ number: "BA 117", departure: { airport: { iata: "LHR" } }, arrival: { airport: { iata: "JFK" } } }]));
    const r = await lookupFlight(input("BA117"));
    expect(r.body.status).toBe("incomplete_data");
    expect(r.body.found).toBe(false);
  });

  it("returns every leg when a number flies more than once that day, sorted by departure", async () => {
    const second = { ...baLeg, departure: { airport: { iata: "JFK" }, scheduledTime: { utc: "2026-10-12 19:00Z" } }, arrival: { airport: { iata: "BOS" }, scheduledTime: { utc: "2026-10-12 20:10Z" } } };
    stubFetch(() => json([second, baLeg]));
    const r = await lookupFlight(input("BA117", "2026-10-12"));
    expect((r.body.options as Array<{ origin: string }>).map((o) => o.origin)).toEqual(["LHR", "JFK"]);
  });

  it("lists a codeshared leg once", async () => {
    stubFetch(() => json([{ ...baLeg, codeshareStatus: "IsCodeshared" }, { ...baLeg, codeshareStatus: "IsOperator" }]));
    const r = await lookupFlight(input("BA117", "2026-10-12"));
    const options = r.body.options as Array<{ notes: string[] }>;
    expect(options).toHaveLength(1);
    expect(options[0].notes).toEqual([]);

    stubFetch(() => json([{ ...baLeg, codeshareStatus: "IsCodeshared" }]));
    const only = await lookupFlight(input("BA117", "2026-10-12"));
    expect((only.body.options as Array<{ notes: string[] }>)[0].notes[0]).toMatch(/Codeshare/);
  });

  it("uses the ICAO filter for AviationStack when given a 3-letter code", async () => {
    process.env.SCHEDULE_PROVIDER = "aviationstack";
    process.env.AVIATIONSTACK_KEY = "k";
    stubFetch(() => json({ data: [] }));
    await lookupFlight(input("GEC8225"));
    expect(calls[0]).toContain("flight_icao=GEC8225");
    calls.length = 0;
    await lookupFlight(input("LH400"));
    expect(calls[0]).toContain("flight_iata=LH400");
    delete process.env.AVIATIONSTACK_KEY;
  });
});

describe("GET /api/flights/lookup", () => {
  const get = (flight: string | null, date: string | null = "2026-10-11") => {
    const u = new URL("https://vola.test/api/flights/lookup");
    if (flight !== null) u.searchParams.set("flight", flight);
    if (date !== null) u.searchParams.set("date", date);
    return GET(new Request(u));
  };

  it("serves lowercase, spaced input", async () => {
    stubFetch(() => json([gecLeg]));
    const res = await get(" gec 8225 ");
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  it("returns 400 with an accurate message for a malformed number, without calling the provider", async () => {
    stubFetch(() => json([gecLeg]));
    const res = await get("BA12345");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("invalid_format");
    expect(body.error).toContain("BA12345");
    expect(calls).toHaveLength(0);
  });

  it("returns a distinct message for a missing flight number", async () => {
    const body = await (await get(null)).json();
    expect(body.status).toBe("invalid_format");
    expect(body.error).toMatch(/^Enter your flight number/);
  });

  it("returns 429 with retry guidance when rate limited", async () => {
    rate.ok = false;
    stubFetch(() => json([gecLeg]));
    const res = await get("GEC8225");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    const body = await res.json();
    expect(body.status).toBe("rate_limited");
    expect(body.error).toMatch(/Try again later/);
    expect(calls).toHaveLength(0);
  });

  it("does not spend rate-limit budget on malformed input", async () => {
    rate.ok = false;
    const res = await get("nonsense");
    expect(res.status).toBe(400);
  });
});
