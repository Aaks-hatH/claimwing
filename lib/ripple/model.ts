import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { artifactSchema, predictWithArtifact, type ModelArtifact, type ModelFlightInput, type ModelPrediction, type Stage } from "./model-core";

/**
 * Loads the trained artifact once per server process. If the file is missing or fails validation,
 * the app keeps working and Flight Ripple uses its labelled rule-based estimate instead.
 * Path: RIPPLE_MODEL_PATH, default data/models/ripple-model.json (produced by `npm run ml:train`).
 */
type Loaded = { artifact: ModelArtifact | null; error: string | null };
const g = globalThis as unknown as { __rippleModel?: Promise<Loaded> };

export function modelPath() {
  return process.env.RIPPLE_MODEL_PATH || path.join(process.cwd(), "data", "models", "ripple-model.json");
}

export async function loadModel(): Promise<Loaded> {
  if (process.env.RIPPLE_MODEL_DISABLED === "true") return { artifact: null, error: "The trained model is turned off (RIPPLE_MODEL_DISABLED)." };
  g.__rippleModel ??= (async () => {
    try {
      const custom = process.env.RIPPLE_MODEL_PATH;
      const text = custom
        ? await readFile(/* turbopackIgnore: true */ custom, "utf8")
        : await readFile(path.join(process.cwd(), "data", "models", "ripple-model.json"), "utf8");
      const raw = JSON.parse(text);
      const parsed = artifactSchema.safeParse(raw);
      if (!parsed.success) return { artifact: null, error: `Model artifact failed validation: ${parsed.error.issues[0]?.message ?? "invalid"}` };
      return { artifact: parsed.data, error: null };
    } catch (e) {
      return { artifact: null, error: e instanceof Error && "code" in e && e.code === "ENOENT" ? "No trained model artifact is installed." : `Model artifact could not be read.` };
    }
  })();
  return g.__rippleModel;
}

export async function predictFlight(stage: Stage, input: ModelFlightInput): Promise<ModelPrediction> {
  const { artifact, error } = await loadModel();
  if (!artifact) return { available: false, reason: error ?? "No model available.", modelVersion: null };
  try {
    return predictWithArtifact(artifact, stage, input);
  } catch (e) {
    return { available: false, reason: `Model inference failed: ${e instanceof Error ? e.message : String(e)}`, modelVersion: artifact.model_version };
  }
}

export async function modelCard() {
  const { artifact, error } = await loadModel();
  if (!artifact) return { available: false as const, reason: error };
  return {
    available: true as const,
    modelVersion: artifact.model_version,
    trainedAt: artifact.trained_at,
    dataset: artifact.dataset.description,
    period: `${artifact.dataset.first_date} to ${artifact.dataset.last_date}`,
    rows: artifact.dataset.rows,
    coverage: artifact.coverage,
    horizonMin: artifact.prediction_horizon_min,
    evaluation: artifact.evaluation_summary,
  };
}
