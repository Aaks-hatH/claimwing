import { describe, expect, it } from "vitest";
import { align, diffMap, regions, toGray, type Gray } from "@/lib/vision/diff";

function canvas(w: number, h: number, paint: (x: number, y: number) => number): Gray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.round(paint(x, y) * 255);
      rgba.set([v, v, v, 255], (y * w + x) * 4);
    }
  return toGray(rgba, w, h);
}

// A textured "bag": smooth gradient plus stripes, so alignment has something to lock on to.
const base = (x: number, y: number) => 0.3 + 0.3 * Math.sin(x / 5) * Math.cos(y / 7) + (x % 16 < 2 ? 0.2 : 0);

describe("photo comparison", () => {
  it("finds no regions when the photos are identical", () => {
    const a = canvas(120, 90, base);
    const d = diffMap(a, a);
    expect(regions(d)).toHaveLength(0);
    expect(align(a, a)).toMatchObject({ dx: 0, dy: 0 });
  });

  it("recovers a framing shift before comparing", () => {
    const a = canvas(120, 90, base);
    const b = canvas(120, 90, (x, y) => base(x - 3, y + 2));
    const s = align(a, b, 6);
    expect(s).toMatchObject({ dx: 3, dy: -2 });
    const unaligned = regions(diffMap(a, b, 0, 0));
    const aligned = regions(diffMap(a, b, s.dx, s.dy));
    expect(aligned.length).toBeLessThan(Math.max(1, unaligned.length));
  });

  it("locates a new mark as a candidate region", () => {
    const a = canvas(120, 90, base);
    const b = canvas(120, 90, (x, y) => (x > 80 && x < 96 && y > 20 && y < 34 ? 0.95 : base(x, y)));
    const r = regions(diffMap(a, b));
    expect(r.length).toBeGreaterThanOrEqual(1);
    const top = r[0];
    // The region covers the painted mark (x 81 to 95, y 21 to 33), within blur tolerance.
    expect(top.x * 120).toBeGreaterThan(74);
    expect((top.x + top.w) * 120).toBeLessThan(102);
    expect(top.y * 90).toBeGreaterThan(14);
    expect((top.y + top.h) * 90).toBeLessThan(40);
  });

  it("ignores faint noise", () => {
    const a = canvas(120, 90, base);
    const b = canvas(120, 90, (x, y) => base(x, y) + ((x * 7 + y * 13) % 5) / 400);
    expect(regions(diffMap(a, b))).toHaveLength(0);
  });
});

describe("adaptive threshold", () => {
  it("finds a thin, low-contrast mark that a fixed threshold misses", () => {
    const a = canvas(240, 180, (x, y) => (x > 60 && x < 180 && y > 30 && y < 160 ? 0.3 : 0.9));
    // A bright, high-contrast label change elsewhere dominates the normalisation...
    const b = canvas(240, 180, (x, y) => {
      if (y > 5 && y < 15 && x > 20 && x < 120) return 0.05;
      // ...and a thin dark crack on the dark shell is only a small difference.
      if (Math.abs(x - 100 - (y - 60) * 0.5) < 1.2 && y > 60 && y < 110) return 0.12;
      return x > 60 && x < 180 && y > 30 && y < 160 ? 0.3 : 0.9;
    });
    const d = diffMap(a, b);
    const fixed = regions(d, 0.5, 0.0012);
    const adaptive = regions(d, "auto", 0.0012);
    const hasCrack = (rs: typeof adaptive) => rs.some((r) => r.y * 180 > 50 && (r.y + r.h) * 180 < 120 && r.x * 240 > 85);
    expect(hasCrack(fixed)).toBe(false);
    expect(hasCrack(adaptive)).toBe(true);
    expect(regions(diffMap(a, a), "auto")).toHaveLength(0);
  });
});
