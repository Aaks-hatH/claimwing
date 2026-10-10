/**
 * Builds data/airports.json and data/airlines.json from open datasets.
 *
 *   npm run data:build
 *
 * Sources (both open data):
 * - OurAirports (public domain): airports, countries
 * - OpenFlights (ODbL): IANA time zones per airport, airline ICAO codes
 *
 * The generated files are committed so the app works without network access.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import tzlookup from "@photostructure/tz-lookup";

const OURAIRPORTS = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main";
const OPENFLIGHTS = "https://raw.githubusercontent.com/jpatokal/openflights/master/data";

async function get(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

/** Minimal RFC 4180 CSV parser (handles quoted fields with commas and quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}

function clean(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === "" || t === "\\N" || t === "-" || t === "N/A" ? null : t;
}

function tzFromCoords(lat: number, lon: number): string | null {
  try {
    return tzlookup(lat, lon);
  } catch {
    return null;
  }
}

async function main() {
  const [airportsCsv, countriesCsv, ofAirports, ofAirlines] = await Promise.all([
    get(`${OURAIRPORTS}/airports.csv`),
    get(`${OURAIRPORTS}/countries.csv`),
    get(`${OPENFLIGHTS}/airports.dat`),
    get(`${OPENFLIGHTS}/airlines.dat`),
  ]);

  // Country name -> ISO code (OpenFlights uses names).
  const countries = parseCsv(countriesCsv);
  const cHead = countries[0];
  const nameToIso = new Map<string, string>();
  for (const r of countries.slice(1)) {
    const code = r[cHead.indexOf("code")];
    const name = r[cHead.indexOf("name")];
    nameToIso.set(name.toLowerCase(), code);
  }
  // A few OpenFlights spellings that differ from OurAirports.
  const aliases: Record<string, string> = {
    "united states": "US",
    "united kingdom": "GB",
    "south korea": "KR",
    "russia": "RU",
    "czech republic": "CZ",
    "macedonia": "MK",
    "ivory coast": "CI",
    "burma": "MM",
    "congo (kinshasa)": "CD",
    "congo (brazzaville)": "CG",
    "netherlands antilles": "CW",
    "hong kong sar of china": "HK",
    "taiwan": "TW",
    "vietnam": "VN",
    "iran": "IR",
    "syria": "SY",
    "laos": "LA",
    "moldova": "MD",
    "bolivia": "BO",
    "venezuela": "VE",
    "tanzania": "TZ",
    "brunei": "BN",
    "turkey": "TR",
  };
  const toIso = (name: string | null) =>
    name ? aliases[name.toLowerCase()] ?? nameToIso.get(name.toLowerCase()) ?? null : null;

  // IATA -> IANA tz from OpenFlights airports.dat
  const tzByIata = new Map<string, string>();
  for (const r of parseCsv(ofAirports)) {
    const iata = clean(r[4]);
    const tz = clean(r[11]);
    if (iata && tz && iata.length === 3) tzByIata.set(iata, tz);
  }

  const rows = parseCsv(airportsCsv);
  const head = rows[0];
  const col = (name: string) => head.indexOf(name);
  const airports: Array<{
    iata: string;
    icao: string | null;
    name: string;
    city: string | null;
    country: string;
    lat: number;
    lon: number;
    tz: string | null;
    size: "L" | "M" | "S";
  }> = [];
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    const type = r[col("type")];
    const iata = clean(r[col("iata_code")]);
    const scheduled = r[col("scheduled_service")] === "yes";
    if (!iata || iata.length !== 3 || !scheduled) continue;
    if (!["large_airport", "medium_airport", "small_airport"].includes(type)) continue;
    if (seen.has(iata)) continue;
    seen.add(iata);
    airports.push({
      iata,
      icao: clean(r[col("icao_code")]) ?? clean(r[col("gps_code")]),
      name: r[col("name")],
      city: clean(r[col("municipality")]),
      country: r[col("iso_country")],
      lat: Number(Number(r[col("latitude_deg")]).toFixed(5)),
      lon: Number(Number(r[col("longitude_deg")]).toFixed(5)),
      tz: tzByIata.get(iata) ?? tzFromCoords(Number(r[col("latitude_deg")]), Number(r[col("longitude_deg")])),
      size: type === "large_airport" ? "L" : type === "medium_airport" ? "M" : "S",
    });
  }
  airports.sort((a, b) => a.iata.localeCompare(b.iata));

  // Airlines: active, with IATA and ICAO codes.
  const airlines: Array<{ iata: string; icao: string; name: string; country: string | null }> = [];
  const seenAirline = new Set<string>();
  for (const r of parseCsv(ofAirlines)) {
    const name = clean(r[1]);
    const iata = clean(r[3]);
    const icao = clean(r[4]);
    const country = clean(r[6]);
    const active = r[7] === "Y";
    if (!name || !iata || !icao || !active) continue;
    if (!/^[A-Z0-9]{2}$/.test(iata) || !/^[A-Z]{3}$/.test(icao)) continue;
    if (seenAirline.has(iata)) continue;
    seenAirline.add(iata);
    airlines.push({ iata, icao, name, country: toIso(country) });
  }
  airlines.sort((a, b) => a.iata.localeCompare(b.iata));

  const out = join(process.cwd(), "data");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "airports.json"), JSON.stringify(airports));
  writeFileSync(join(out, "airlines.json"), JSON.stringify(airlines));
  const missingTz = airports.filter((a) => !a.tz).length;
  console.log(
    `airports: ${airports.length} (without tz: ${missingTz}); airlines: ${airlines.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
