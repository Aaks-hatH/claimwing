/**
 * Before/after photo comparison that runs in the browser (no upload, no AI service).
 *
 * 1. Both photos are drawn at the same small size and turned to grayscale.
 * 2. Alignment: the after photo is shifted by up to `maxShift` pixels in each direction; the
 *    shift with the smallest mean absolute difference wins. This corrects small framing changes,
 *    not different angles or zoom levels.
 * 3. Difference map: absolute difference after alignment, smoothed with a small box blur so camera
 *    noise and JPEG artefacts don't light up, on a fixed 0..1 scale.
 * 4. Candidate regions: cells above a threshold are grouped into connected regions; small ones are
 *    dropped. Each region gets a score (its mean difference).
 *
 * This finds places where the two photos differ. A difference can be damage, but also a shadow,
 * a reflection, a strap in a different place or a different background. Results are always
 * candidates for a person to confirm or reject.
 */

export type Gray = { w: number; h: number; px: Float32Array };
export type Region = { x: number; y: number; w: number; h: number; score: number; area: number };

export function toGray(rgba: Uint8ClampedArray | number[], w: number, h: number): Gray {
  const px = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    px[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  }
  return { w, h, px };
}

function at(g: Gray, x: number, y: number) {
  return g.px[y * g.w + x];
}

/** Best integer shift (dx, dy) to apply to `b` so it lines up with `a`. */
export function align(a: Gray, b: Gray, maxShift = 8): { dx: number; dy: number; error: number } {
  let best = { dx: 0, dy: 0, error: Infinity };
  const step = Math.max(1, Math.floor(Math.min(a.w, a.h) / 96));
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      let sum = 0;
      let n = 0;
      for (let y = maxShift; y < a.h - maxShift; y += step) {
        for (let x = maxShift; x < a.w - maxShift; x += step) {
          sum += Math.abs(at(a, x, y) - at(b, x + dx, y + dy));
          n++;
        }
      }
      const err = n ? sum / n : Infinity;
      // Prefer smaller shifts on ties, so identical photos stay at (0, 0).
      if (err < best.error - 1e-9) best = { dx, dy, error: err };
    }
  }
  return best;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Difference map in 0..1 after shifting `b` by (dx, dy). Pixels shifted in from outside count as 0. */
export function diffMap(a: Gray, b: Gray, dx = 0, dy = 0, blur = 2): Gray {
  const raw = new Float32Array(a.w * a.h);
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const bx = x + dx;
      const by = y + dy;
      raw[y * a.w + x] = bx < 0 || by < 0 || bx >= b.w || by >= b.h ? 0 : Math.abs(at(a, x, y) - at(b, bx, by));
    }
  }
  const smooth = blur > 0 ? boxBlur(raw, a.w, a.h, blur) : raw;
  // Normalise on a fixed scale (a luminance difference of 0.5 or more is full strength), so one very
  // strong change elsewhere in the photo doesn't hide a subtle one like a crack on a dark shell.
  for (let i = 0; i < smooth.length; i++) smooth[i] = Math.min(1, smooth[i] / 0.5);
  return { w: a.w, h: a.h, px: smooth };
}

/**
 * Threshold that adapts to the image: well above the typical difference, kept between 0.15 and 0.5.
 * Thin, low-contrast marks (a crack on a dark shell) still stand out when the rest of the photo
 * matches, while noisy photos need a stronger difference.
 */
export function autoThreshold(d: Gray): number {
  // Robust statistics (median and median absolute deviation) on a sample, so large real changes
  // don't raise the bar for small ones.
  const step = Math.max(1, Math.floor(d.px.length / 20000));
  const sample: number[] = [];
  for (let i = 0; i < d.px.length; i += step) sample.push(d.px[i]);
  sample.sort((x, y) => x - y);
  const median = sample[Math.floor(sample.length / 2)] ?? 0;
  const dev = sample.map((v) => Math.abs(v - median)).sort((x, y) => x - y);
  const mad = dev[Math.floor(dev.length / 2)] ?? 0;
  return Math.min(0.5, Math.max(0.15, median + 8 * mad));
}

/** Connected regions of the difference map above `threshold` (or an adaptive one), as fractions of the image size. */
export function regions(d: Gray, threshold: number | "auto" = 0.45, minAreaFrac = 0.002): Region[] {
  const { w, h, px } = d;
  if (threshold === "auto") threshold = autoThreshold(d);
  const seen = new Uint8Array(w * h);
  const out: Region[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || px[i] < threshold) continue;
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0, sum = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w;
      const y = (j - x) / w;
      area++;
      sum += px[j];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1];
      for (const k of nb) {
        if (k >= 0 && !seen[k] && px[k] >= threshold) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    if (area / (w * h) >= minAreaFrac) {
      out.push({ x: minX / w, y: minY / h, w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h, score: sum / area, area: area / (w * h) });
    }
  }
  return out.sort((a, b) => b.score * b.area - a.score * a.area).slice(0, 8);
}

/** Paints a difference map into RGBA (transparent to red) for an overlay canvas. */
export function heatmapRgba(d: Gray, alpha = 0.75): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(d.w * d.h * 4));
  for (let i = 0; i < d.px.length; i++) {
    const v = d.px[i];
    out[i * 4] = 255;
    out[i * 4 + 1] = Math.round(220 * (1 - v));
    out[i * 4 + 2] = 40;
    out[i * 4 + 3] = Math.round(255 * alpha * Math.max(0, v - 0.15) / 0.85);
  }
  return out;
}
