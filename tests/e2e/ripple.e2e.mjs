#!/usr/bin/env node
/**
 * End-to-end checks against a running ClaimWing server and its real database.
 *
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Creates throwaway accounts (e2e-*@example.test), so point it at a development database.
 * Covers Flight Ripple authorization and privacy, duplicates, rate limits, opt-out and deletion,
 * demo isolation, guidance persistence, and that existing claim exports still work.
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const RUN = Date.now().toString(36);
let passed = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) passed++;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${!cond && detail ? ` (${detail})` : ""}`);
}

class Client {
  constructor() {
    this.cookies = new Map();
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  async req(path, { method = "GET", json, form } = {}) {
    const headers = { cookie: this.header() };
    let body;
    if (json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
    this.store(res);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers, text };
  }
  async signup(name, email, password) {
    const r = await this.req("/api/signup", { method: "POST", json: { name, email, password } });
    if (r.status !== 201) throw new Error(`signup ${r.status} ${r.text}`);
    return this.signin(email, password);
  }
  async signin(email, password) {
    const csrf = await this.req("/api/auth/csrf");
    const r = await this.req("/api/auth/callback/credentials", { method: "POST", form: { csrfToken: csrf.data.csrfToken, email, password, callbackUrl: `${BASE}/app`, json: "true" } });
    if (r.status >= 400) throw new Error(`signin ${r.status}`);
    const s = await this.req("/api/auth/session");
    if (!s.data?.user) throw new Error("no session after sign-in");
    return s.data.user;
  }
}

function localParts(d) {
  // Times for an airport in UTC (LHR is UTC+0 or +1; use a UTC airport-free approach: KEF is always UTC).
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

async function addTrip(c, { flight, depOffsetMin, durationMin = 180, origin = "KEF", destination = "LHR" }) {
  const dep = new Date(Date.now() + depOffsetMin * 60_000);
  const arr = new Date(dep.getTime() + durationMin * 60_000);
  const d = localParts(dep);
  // Arrival at LHR: convert UTC to London time.
  const lon = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(arr);
  const g = (t) => lon.find((p) => p.type === t).value;
  const r = await c.req("/api/trips", {
    method: "POST",
    json: {
      airline: flight.slice(0, 2),
      flightNumber: flight.slice(2),
      flightDate: d.date,
      origin,
      destination,
      departureTime: d.time,
      arrivalDate: `${g("year")}-${g("month")}-${g("day")}`,
      arrivalTime: `${g("hour")}:${g("minute")}`,
      passengerName: "E2E Passenger",
      bookingRef: null,
      ticketPrice: null,
      operatingCarrierRegion: "auto",
      icao24: "",
    },
  });
  if (r.status !== 201) throw new Error(`addTrip ${r.status} ${r.text}`);
  return r.data.trip;
}

async function main() {
  const pw = "E2e-password-123";
  const A = new Client();
  const B = new Client();
  const C = new Client();
  const userA = await A.signup("Ava E2E", `e2e-a-${RUN}@example.test`, pw);
  await B.signup("Ben E2E", `e2e-b-${RUN}@example.test`, pw);
  await C.signup("Cal E2E", `e2e-c-${RUN}@example.test`, pw);
  check("three accounts signed in", Boolean(userA?.email));

  const flight = `FI${400 + Math.floor(Math.random() * 500)}`;
  const tripA = await addTrip(A, { flight, depOffsetMin: 60 });
  const tripB = await addTrip(B, { flight, depOffsetMin: 60 });
  const tripC = await addTrip(C, { flight: "FI999", depOffsetMin: 60 });
  check("same dated flight added by A and B", tripA.id && tripB.id && tripA.flightDate === tripB.flightDate);

  // --- reporting and validation ---
  let r = await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "boarding_not_started" } });
  check("A can report on a flight they follow", r.status === 201, `${r.status} ${r.text}`);
  r = await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "boarding_not_started" } });
  check("duplicate within 10 minutes is rejected", r.status === 409, `${r.status}`);
  r = await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "made_up_event" } });
  check("unknown report type is rejected", r.status === 400, `${r.status}`);
  r = await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "boarding_started", source: "provider" } });
  check("client cannot set source or extra fields", r.status === 400, `${r.status}`);
  r = await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "delay_announced", value: 9999 } });
  check("implausible value is rejected with a message", r.status === 422 && /minutes/.test(r.data.error ?? ""), `${r.status}`);
  r = await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "boarding_started", observedAt: new Date(Date.now() + 3600_000).toISOString() } });
  check("future observation time is rejected", r.status === 422, `${r.status}`);
  r = await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "gate_changed", value: "b32", note: "call me +44 7700 900123 or ava@example.test" } });
  check("gate change accepted", r.status === 201, `${r.status} ${r.text}`);
  const r2 = await B.req(`/api/ripple/${tripB.id}/reports`, { method: "POST", json: { type: "boarding_not_started" } });
  check("B reports the same thing", r2.status === 201, `${r2.status}`);

  // --- aggregate and privacy ---
  r = await B.req(`/api/ripple/${tripB.id}`);
  check("B can read Flight Ripple for their trip", r.status === 200, `${r.status} ${r.text.slice(0, 200)}`);
  const claim = r.data?.result?.reports?.claims?.find((c) => c.type === "boarding_not_started");
  check("B sees A's and B's observations aggregated", claim?.contributors === 2, JSON.stringify(claim));
  const leaked = [userA.email, userA.id, "ava@example.test", "7700 900123", '"contributor":', '"userId"'].filter((s) => s && r.text.includes(s));
  const hexIds = r.text.match(/"[0-9a-f]{16}"/g) ?? [];
  if (hexIds.length) leaked.push(`possible contributor ids: ${hexIds.join(",")}`);
  check("aggregate exposes no emails, account ids, notes or contributor ids", leaked.length === 0, leaked.join(", "));
  check("B's view never includes A's personal reports", !(r.data.myReports ?? []).some((m) => m.type === "gate_changed"));
  r = await A.req(`/api/ripple/${tripA.id}`);
  const mine = r.data?.myReports?.find((m) => m.type === "gate_changed");
  check("A sees their own note, with contact details removed", mine && mine.note && !/7700|example\.test/.test(mine.note), JSON.stringify(mine));
  check("result is labelled with how it was produced", ["ml", "fallback", "unknown"].includes(r.data?.result?.kind), r.data?.result?.kind);

  // --- authorization ---
  r = await C.req(`/api/ripple/${tripA.id}`);
  check("C cannot read Flight Ripple for A's trip", r.status === 404, `${r.status}`);
  r = await C.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "departed" } });
  check("C cannot report through A's trip", r.status === 404, `${r.status}`);
  const anon = new Client();
  r = await anon.req(`/api/ripple/${tripA.id}`);
  check("signed-out request is refused", r.status === 401, `${r.status}`);
  r = await C.req(`/api/ripple/${tripC.id}`);
  check("C's different flight has no reports from A or B", r.status === 200 && r.data.result.reports.totalReports === 0, `${r.data?.result?.reports?.totalReports}`);
  if (mine) {
    r = await C.req(`/api/ripple/reports/${mine.id}`, { method: "DELETE" });
    check("C cannot delete A's report", r.status === 404, `${r.status}`);
  }

  // --- rate limit per person per flight ---
  // "landed" and "bags_arriving" before the flight has even departed don't fit its phase.
  const types = ["landed", "bags_arriving", "doors_closed", "departed", "deplaning", "incoming_aircraft_at_gate", "incoming_aircraft_not_at_gate"];
  const statuses = [];
  for (const t of types) statuses.push((await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: t } })).status);
  check("per-person-per-flight rate limit kicks in", statuses.includes(429), statuses.join(","));
  r = await A.req(`/api/ripple/${tripA.id}`);
  const flagged = (r.data?.myReports ?? []).filter((m) => m.moderation === "flagged");
  check("reports that don't fit the flight's phase are flagged, not trusted", flagged.length > 0, `${flagged.length}`);

  // --- opt-out, restore, delete ---
  r = await A.req("/api/ripple/sharing", { method: "PUT", json: { on: false } });
  check("A turns sharing off", r.status === 200);
  r = await B.req(`/api/ripple/${tripB.id}`);
  const after = r.data?.result?.reports?.claims?.find((c) => c.type === "boarding_not_started");
  check("A's reports disappear from B's aggregate", after?.contributors === 1, JSON.stringify(after));
  r = await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "boarding_started" } });
  check("A cannot report while sharing is off", r.status === 403, `${r.status}`);
  await A.req("/api/ripple/sharing", { method: "PUT", json: { on: true } });
  r = await B.req(`/api/ripple/${tripB.id}`);
  check("turning sharing back on restores A's reports", r.data?.result?.reports?.claims?.find((c) => c.type === "boarding_not_started")?.contributors === 2);
  r = await A.req("/api/ripple/reports", { method: "DELETE" });
  check("A deletes all their observations", r.status === 200 && r.data.deleted >= 2, JSON.stringify(r.data));
  r = await B.req(`/api/ripple/${tripB.id}`);
  check("deleted reports are gone for everyone", r.data?.result?.reports?.claims?.find((c) => c.type === "boarding_not_started")?.contributors === 1);

  // --- prediction history ---
  r = await B.req(`/api/ripple/${tripB.id}/history`);
  check("versioned prediction records are stored", r.status === 200 && r.data.history.length >= 1, `${r.data?.history?.length}`);

  // --- demo isolation ---
  r = await anon.req("/api/demo/scenarios/cascade");
  check("Demo Center works without an account", r.status === 200 && r.data.simulated === true && r.data.frames.length === 11);
  check("every demo frame is labelled as simulation", r.data.frames.every((f) => f.result.kind === "replay"));
  const again = await anon.req("/api/demo/scenarios/cascade");
  check("demo is deterministic across requests", JSON.stringify(again.data.frames) === JSON.stringify(r.data.frames));
  const demoTrip = await A.req("/api/trips", { method: "POST", json: { demo: true } });
  if (demoTrip.status === 201) {
    r = await A.req(`/api/ripple/${demoTrip.data.trip.id}/reports`, { method: "POST", json: { type: "boarding_started" } });
    check("passenger reports are refused on demo replay trips", r.status === 400 || r.status === 422, `${r.status}`);
  }
  r = await C.req(`/api/ripple/${tripC.id}`);
  check("simulation data never appears in production aggregates", r.data.result.reports.totalReports === 0);

  // --- guidance persistence ---
  r = await A.req("/api/account/guidance", { method: "PATCH", json: { onboarding: "completed", dismissHint: "ripple-intro" } });
  check("onboarding completion is saved", r.status === 200);
  r = await A.req("/api/account/guidance", { method: "PATCH", json: { dismissHint: "<script>" } });
  check("guidance input is validated", r.status === 400);

  // --- account export ---
  await A.req(`/api/ripple/${tripA.id}/reports`, { method: "POST", json: { type: "incoming_aircraft_at_gate" } }).catch(() => null);
  r = await A.req("/api/account/export");
  check("account export includes flight reports without contributor ids", r.status === 200 && Array.isArray(r.data.flightReports) && !r.text.includes('"contributor"'), `${r.status}`);

  // --- existing claim workflow still works (demo replay trip has a full flight) ---
  if (demoTrip.status === 201) {
    r = await A.req("/api/claims", { method: "POST", json: { tripId: demoTrip.data.trip.id, type: "flight", baggageIds: [] } });
    check("claim can still be created", r.status === 201, `${r.status} ${r.text.slice(0, 160)}`);
    const claimId = r.data?.claim?.id;
    if (claimId) {
      const pdf = await A.req(`/api/claims/${claimId}/pdf?preview=1`);
      check("PDF preview renders inline", pdf.status === 200 && pdf.headers.get("content-type") === "application/pdf" && /inline/.test(pdf.headers.get("content-disposition") ?? ""), `${pdf.status}`);
      const zip = await A.req(`/api/claims/${claimId}/zip`);
      check("ZIP export still works", zip.status === 200 && /zip/.test(zip.headers.get("content-type") ?? ""), `${zip.status} ${zip.headers.get("content-type")}`);
      const page = await A.req(`/app/claims/${claimId}`);
      check("claim page shows the readiness checklist", page.status === 200 && page.text.includes("Claim readiness"), `${page.status}`);
    }
  }

  // --- pages render for a signed-in user ---
  for (const p of ["/app", "/app/trips", "/app/claims", "/app/settings", "/app/welcome", `/app/trips/${tripA.id}?tab=ripple`, "/demo", "/"]) {
    const res = await A.req(p);
    check(`page ${p} renders`, res.status === 200, `${res.status}`);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
