/**
 * Generates data/replays/sample-ba117-lhr-jfk.json: a SYNTHETIC demo flight
 * (great-circle path with a realistic climb, cruise and descent). It is not a
 * recording; it is labelled synthetic everywhere it appears.
 *
 * To record a real flight instead, use scripts/record-replay.ts.
 *
 *   npx tsx scripts/make-sample-replay.ts
 */
import { writeFileSync } from "node:fs";

const LHR = { lat: 51.47075, lon: -0.45991 };
const JFK = { lat: 40.63945, lon: -73.77932 };

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function interpolate(a: typeof LHR, b: typeof LHR, f: number) {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lon), φ2 = toRad(b.lat), λ2 = toRad(b.lon);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: toDeg(Math.atan2(y, x)) };
}

function bearing(a: typeof LHR, b: typeof LHR) {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Timeline (minutes after the scheduled 10:20 departure): pushback 3h18 late,
// takeoff 3h35, 7h55 airborne (headwinds), gate arrival 3h29 after the scheduled arrival.
const scheduledDurationMin = 480;
const gateDepartureMin = 198;
const takeoffMin = 215;
const airborne = 475;
const touchdownMin = takeoffMin + airborne;
const gateArrivalMin = touchdownMin + 9;

const points = [];
// Taxi out at LHR
for (let t = gateDepartureMin; t < takeoffMin; t += 4) {
  points.push({ t, lat: LHR.lat + 0.002 * ((t - gateDepartureMin) / 17), lon: LHR.lon - 0.01 * ((t - gateDepartureMin) / 17), alt: 0, gs: 8, trk: 270, vr: 0, gnd: true });
}
for (let i = 0; i <= airborne; i += 3) {
  const f = i / airborne;
  const p = interpolate(LHR, JFK, f);
  const next = interpolate(LHR, JFK, Math.min(1, f + 0.001));
  const climb = Math.min(1, i / 25);
  const descent = Math.min(1, (airborne - i) / 30);
  const alt = Math.round(11000 * Math.min(climb, descent));
  const gs = Math.round(80 + 165 * Math.min(climb, descent) * 10) / 10;
  const vr = i < 25 ? 7.3 : airborne - i < 30 ? -6.1 : 0;
  points.push({ t: takeoffMin + i, lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5), alt, gs, trk: Math.round(bearing(p, next)), vr, gnd: i === airborne });
}
// Taxi in at JFK
for (let t = touchdownMin + 2; t <= gateArrivalMin; t += 2) {
  points.push({ t, lat: JFK.lat + 0.004 * ((t - touchdownMin) / 9), lon: JFK.lon + 0.003 * ((t - touchdownMin) / 9), alt: 0, gs: 7, trk: 40, vr: 0, gnd: true });
}

const replay = {
  label: "BA117 London Heathrow to New York JFK (synthetic demo flight)",
  synthetic: true,
  flightNumber: "BA117",
  origin: "LHR",
  destination: "JFK",
  icao24: "400f00",
  callsign: "BAW117",
  scheduledDurationMin,
  gateDepartureMin,
  takeoffMin,
  touchdownMin,
  gateArrivalMin,
  cause: "technical",
  points,
};

writeFileSync("data/replays/sample-ba117-lhr-jfk.json", JSON.stringify(replay));
console.log(`points: ${points.length}, gate arrival delay: ${gateArrivalMin - scheduledDurationMin} min`);
