/**
 * Records a REAL flight from airplanes.live into a replay file.
 *
 *   npx tsx scripts/record-replay.ts --callsign BAW117 --flight BA117 \
 *     --from LHR --to JFK --scheduled-departure 2026-10-10T09:20:00Z --scheduled-arrival 2026-10-10T17:20:00Z \
 *     --out data/replays/ba117-2026-10-10.json
 *
 * Leave it running from before pushback until after the aircraft reaches the gate,
 * then press Ctrl+C. The file is written on every sample, so stopping early is safe.
 * Respect airplanes.live's terms: one request per second at most; this polls every 15 s.
 */
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
for (const k of ["callsign", "flight", "from", "to", "scheduled-departure", "scheduled-arrival", "out"]) {
  if (!args[k]) {
    console.error(`Missing --${k}`);
    process.exit(1);
  }
}

const schedDep = new Date(args["scheduled-departure"]).getTime();
const schedArr = new Date(args["scheduled-arrival"]).getTime();
const min = (t: number) => (t - schedDep) / 60000;

type Pt = { t: number; lat: number; lon: number; alt: number; gs: number; trk: number; vr: number; gnd: boolean };
const points: Pt[] = [];
let icao24 = "";
let takeoffMin: number | null = null;
let touchdownMin: number | null = null;

function save() {
  const first = points[0]?.t ?? 0;
  const last = points[points.length - 1]?.t ?? 0;
  writeFileSync(
    args.out,
    JSON.stringify({
      label: `${args.flight} ${args.from} to ${args.to} (recorded ${new Date(schedDep).toISOString().slice(0, 10)})`,
      synthetic: false,
      flightNumber: args.flight,
      origin: args.from,
      destination: args.to,
      icao24,
      callsign: args.callsign,
      scheduledDurationMin: Math.round(min(schedArr)),
      gateDepartureMin: Math.round(first),
      takeoffMin: Math.round(takeoffMin ?? first),
      touchdownMin: Math.round(touchdownMin ?? last),
      // Gate arrival is not visible in ADS-B; edit this from the airline or airport record if you have it.
      gateArrivalMin: Math.round(last),
      cause: "unknown",
      points,
    }),
  );
}

async function tick() {
  try {
    const res = await fetch(`https://api.airplanes.live/v2/callsign/${args.callsign}`, {
      headers: { "User-Agent": "Vola replay recorder" },
    });
    const data = (await res.json()) as { now: number; ac?: Array<Record<string, unknown>> };
    const a = data.ac?.find((x) => typeof x.lat === "number");
    if (a) {
      icao24 = String(a.hex);
      const gnd = a.alt_baro === "ground";
      const t = min(data.now - Number(a.seen_pos ?? 0) * 1000);
      const prev = points[points.length - 1];
      if (prev && !gnd && prev.gnd && takeoffMin === null) takeoffMin = t;
      if (prev && gnd && !prev.gnd) touchdownMin = t;
      points.push({
        t: +t.toFixed(2),
        lat: a.lat as number,
        lon: a.lon as number,
        alt: gnd ? 0 : Math.round(Number(a.alt_baro ?? 0) * 0.3048),
        gs: +(Number(a.gs ?? 0) * 0.514444).toFixed(1),
        trk: Math.round(Number(a.track ?? 0)),
        vr: +((Number(a.baro_rate ?? 0) * 0.3048) / 60).toFixed(2),
        gnd,
      });
      save();
      console.log(new Date().toISOString(), `t=${t.toFixed(1)}min`, gnd ? "ground" : `${a.alt_baro} ft`, `${points.length} points`);
    } else {
      console.log(new Date().toISOString(), "not visible");
    }
  } catch (e) {
    console.error("poll failed", e);
  }
}

tick();
setInterval(tick, 15_000);
