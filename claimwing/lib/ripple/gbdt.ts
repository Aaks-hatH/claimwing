/**
 * Evaluates gradient-boosted trees exported by ml/ripple_ml/export.py. Pure and dependency-free,
 * so the trained model runs inside the Next.js server with no Python service.
 */

export type ExportedTree = {
  feature: number[];
  threshold: number[];
  default_left: number[];
  missing_type: number[]; // 0 none, 1 zero, 2 NaN
  left: number[];
  right: number[];
  leaf: number[];
  root: number;
};

export type ExportedModel = {
  objective: "binary" | "regression_l1";
  num_features: number;
  feature_names: string[];
  trees: ExportedTree[];
};

export type Calibration = { x: number[]; y: number[] };

/** Missing features are passed as null (or NaN). */
export function rawScore(model: ExportedModel, x: Array<number | null>): number {
  let total = 0;
  for (const t of model.trees) {
    let node = t.root;
    while (node >= 0) {
      let v = x[t.feature[node]];
      const mt = t.missing_type[node];
      const isNan = v === null || v === undefined || Number.isNaN(v);
      if (isNan && mt !== 2) v = 0;
      let goLeft: boolean;
      if ((mt === 2 && isNan) || (mt === 1 && v === 0)) goLeft = t.default_left[node] === 1;
      else goLeft = (v as number) <= t.threshold[node];
      node = goLeft ? t.left[node] : t.right[node];
    }
    total += t.leaf[-node - 1];
  }
  return total;
}

export function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

/** Piecewise-linear interpolation, clipped at both ends (matches numpy.interp). */
export function interp(p: number, cal: Calibration): number {
  const { x, y } = cal;
  if (!x.length) return p;
  if (p <= x[0]) return y[0];
  if (p >= x[x.length - 1]) return y[y.length - 1];
  let lo = 0;
  let hi = x.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= p) lo = mid;
    else hi = mid;
  }
  if (x[hi] === x[lo]) return y[hi];
  return y[lo] + ((p - x[lo]) / (x[hi] - x[lo])) * (y[hi] - y[lo]);
}

export function predictProbability(model: ExportedModel, cal: Calibration | null, x: Array<number | null>): { raw: number; calibrated: number } {
  const raw = sigmoid(rawScore(model, x));
  return { raw, calibrated: cal ? interp(raw, cal) : raw };
}
