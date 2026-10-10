/**
 * Model A inference (pure). Rebuilds the training features (ml/ripple_ml/features.py) for a live
 * flight and evaluates the exported trees. The artifact is validated before use, and anything the
 * model can't support (outside coverage, missing departure delay en route) returns an explicit
 * "unavailable" result instead of a number.
 */
import { DateTime } from "luxon";
import { z } from "zod";
import { predictProbability, rawScore, type Calibration, type ExportedModel } from "./gbdt";

const treeSchema = z.object({
  feature: z.array(z.number().int()),
  threshold: z.array(z.number()),
  default_left: z.array(z.number().int()),
  missing_type: z.array(z.number().int()),
  left: z.array(z.number().int()),
  right: z.array(z.number().int()),
  leaf: z.array(z.number()),
  root: z.number().int(),
});
const modelSchema = z.object({
  objective: z.enum(["binary", "regression_l1"]),
  num_features: z.number().int(),
  feature_names: z.array(z.string()),
  trees: z.array(treeSchema).min(1),
});
const calSchema = z.object({ x: z.array(z.number()), y: z.array(z.number()) }).nullable();
const stageSummary = z.record(z.string(), z.unknown());

export const artifactSchema = z.object({
  schema_version: z.literal(1),
  model_version: z.string(),
  trained_at: z.string(),
  dataset: z.object({ source: z.string(), description: z.string(), first_date: z.string(), last_date: z.string(), rows: z.number() }).passthrough(),
  coverage: z.object({ origins: z.array(z.string()), carriers: z.array(z.string()) }),
  prediction_horizon_min: z.number(),
  thresholds: z.array(z.number()),
  features: z.object({ predeparture: z.array(z.string()), enroute: z.array(z.string()) }).passthrough(),
  smoothing: z.number(),
  model_a: z.object({
    models: z.object({
      classifiers: z.record(z.string(), z.record(z.string(), z.object({ model: modelSchema, calibration: calSchema }).passthrough())),
      regressors: z.record(z.string(), z.object({ model: modelSchema })),
    }),
    encoders: z.object({
      tables: z.record(z.string(), z.record(z.string(), z.tuple([z.number(), z.number(), z.number()]))),
      prior: z.object({ r15: z.number(), r60: z.number() }),
    }),
    parity: z.array(z.object({ stage: z.string(), threshold: z.number(), x: z.array(z.number().nullable()), raw_score: z.number(), p_calibrated: z.number() })),
  }),
  model_b: z.unknown().nullable(),
  evaluation_summary: z.object({ test_period: z.array(z.union([z.string(), z.number()])), stages: z.record(z.string(), stageSummary), model_b: z.string().optional() }),
});
export type ModelArtifact = z.infer<typeof artifactSchema>;

export type Stage = "predeparture" | "enroute";

export type ModelFlightInput = {
  carrier: string; // IATA airline code, e.g. "B6"
  flightNumber: string; // "B61234" or "1234"
  origin: string;
  destination: string;
  originTz: string;
  destinationTz: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  distanceKm: number;
  /** Actual departure delay in minutes, once the aircraft has left the gate. */
  departureDelayMin?: number | null;
  /** Weather at the origin around the prediction time, in Open-Meteo units. */
  weather?: { windKmh: number | null; visibilityKm: number | null; precipMm: number | null; tempC: number | null } | null;
};

export type ModelPrediction =
  | {
      available: true;
      modelVersion: string;
      stage: Stage;
      trainedAt: string;
      dataset: string;
      probabilities: Record<string, number>;
      /** Median expected arrival delay in minutes, from the regression model. */
      expectedDelayMin: number;
      missingInputs: string[];
      evaluation: Record<string, unknown>;
      calibrated: Record<string, boolean>;
      /** Thresholds whose model did not beat its baseline on the test period; not shown. */
      withheld: Array<{ threshold: number; reason: string }>;
    }
  | { available: false; reason: string; modelVersion: string | null };

function flightDigits(flightNumber: string, carrier: string) {
  const f = flightNumber.toUpperCase().replace(/\s+/g, "");
  const rest = f.startsWith(carrier.toUpperCase()) ? f.slice(carrier.length) : f.replace(/^[A-Z0-9]{2}(?=\d)/, "");
  return String(Number(rest.replace(/[A-Z]$/, "")));
}

export function buildFeatures(art: ModelArtifact, stage: Stage, f: ModelFlightInput): { x: Array<number | null>; missing: string[] } {
  const dep = DateTime.fromJSDate(f.scheduledDeparture).setZone(f.originTz);
  const arr = DateTime.fromJSDate(f.scheduledArrival).setZone(f.destinationTz);
  const enc = art.model_a.encoders;
  const missing: string[] = [];
  const lookup = (table: string, key: string) => enc.tables[table]?.[key] ?? null;
  const rate = (table: string, key: string, which: 1 | 2) => {
    const v = lookup(table, key);
    return v ? v[which] : which === 1 ? enc.prior.r15 : enc.prior.r60;
  };
  const logn = (table: string, key: string) => {
    const v = lookup(table, key);
    return v ? Math.log1p(v[0]) : 0;
  };
  const route = `${f.origin}|${f.destination}`;
  const oh = `${f.origin}|${dep.hour}`;
  const fl = `${f.carrier}|${flightDigits(f.flightNumber, f.carrier)}|${f.origin}`;
  if (!lookup("route", route)) missing.push("history for this route");
  if (!lookup("flight", fl)) missing.push("history for this flight number");
  const w = f.weather;
  if (!w || w.windKmh === null) missing.push("weather at the departure airport");
  const values: Record<string, number | null> = {
    month: dep.month,
    dow: dep.weekday - 1,
    dep_hour: dep.hour + dep.minute / 60,
    arr_hour: arr.hour + arr.minute / 60,
    distance_km: f.distanceKm,
    sched_block_min: (f.scheduledArrival.getTime() - f.scheduledDeparture.getTime()) / 60_000,
    wx_wind_kmh: w?.windKmh ?? null,
    wx_visibility_km: w?.visibilityKm === null || w?.visibilityKm === undefined ? null : Math.min(16, w.visibilityKm),
    wx_precip_mm: w?.precipMm ?? null,
    wx_temp_c: w?.tempC ?? null,
    carrier_r15: rate("carrier", f.carrier, 1),
    carrier_r60: rate("carrier", f.carrier, 2),
    route_r15: rate("route", route, 1),
    route_r60: rate("route", route, 2),
    route_logn: logn("route", route),
    origin_hour_r15: rate("origin_hour", oh, 1),
    origin_hour_r60: rate("origin_hour", oh, 2),
    flight_r15: rate("flight", fl, 1),
    flight_r60: rate("flight", fl, 2),
    flight_logn: logn("flight", fl),
    dep_delay: f.departureDelayMin ?? null,
  };
  const names = art.features[stage];
  const x = names.map((n) => {
    if (!(n in values)) throw new Error(`Model expects unknown feature ${n}`);
    return values[n];
  });
  return { x, missing };
}

export function predictWithArtifact(art: ModelArtifact, stage: Stage, f: ModelFlightInput): ModelPrediction {
  if (!art.coverage.origins.includes(f.origin)) {
    return {
      available: false,
      modelVersion: art.model_version,
      reason: `The trained model only covers departures from ${art.coverage.origins.join(", ")} (${art.dataset.description}). ${f.origin} is outside that coverage.`,
    };
  }
  if (!art.coverage.carriers.includes(f.carrier)) {
    return { available: false, modelVersion: art.model_version, reason: `The trained model has no history for airline ${f.carrier}.` };
  }
  if (stage === "enroute" && (f.departureDelayMin === null || f.departureDelayMin === undefined)) {
    return { available: false, modelVersion: art.model_version, reason: "The en-route model needs the actual departure time, which isn't known yet." };
  }
  const { x, missing } = buildFeatures(art, stage, f);
  const probabilities: Record<string, number> = {};
  const calibrated: Record<string, boolean> = {};
  const withheld: Array<{ threshold: number; reason: string }> = [];
  const evalStage = (art.evaluation_summary.stages[stage] ?? {}) as Record<string, { beats_baseline?: boolean } | undefined>;
  for (const t of art.thresholds) {
    const m = art.model_a.models.classifiers[stage]?.[String(t)];
    if (!m) continue;
    if (evalStage[String(t)]?.beats_baseline === false) {
      withheld.push({ threshold: t, reason: `On held-out test data this model was not better than a simple baseline for delays of ${t}+ minutes, so its probability isn't shown.` });
      continue;
    }
    probabilities[String(t)] = round(predictProbability(m.model as ExportedModel, m.calibration as Calibration | null, x).calibrated);
    calibrated[String(t)] = Boolean(m.calibration);
  }
  // Probabilities for higher thresholds can't exceed lower ones; enforce monotonicity.
  const ts = art.thresholds.map(String).filter((t) => t in probabilities);
  for (let i = 1; i < ts.length; i++) {
    if (probabilities[ts[i]] > probabilities[ts[i - 1]]) probabilities[ts[i]] = probabilities[ts[i - 1]];
  }
  const reg = art.model_a.models.regressors[stage];
  const expectedDelayMin = reg ? Math.round(rawScore(reg.model as ExportedModel, x)) : NaN;
  return {
    available: true,
    modelVersion: art.model_version,
    stage,
    trainedAt: art.trained_at,
    dataset: art.dataset.description,
    probabilities,
    expectedDelayMin,
    missingInputs: missing,
    evaluation: (art.evaluation_summary.stages[stage] ?? {}) as Record<string, unknown>,
    calibrated,
    withheld,
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
