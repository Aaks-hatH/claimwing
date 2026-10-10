"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, FlaskConical, X } from "lucide-react";
import { align, diffMap, heatmapRgba, regions, toGray, type Region } from "@/lib/vision/diff";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { ControlBar, usePlayer } from "./player";

const W = 480;
const H = 360;
const STEPS = ["Check-in photo", "Carousel photo", "Align", "Compare", "Review findings", "Export"];
const NARRATION = [
  "At check-in the passenger photographs the bag. ClaimWing keeps the original file untouched with its timestamp and a SHA-256 hash.",
  "At the carousel, the same angle again. The camera guide overlays the first photo, but hand-held photos never line up perfectly.",
  "ClaimWing tries small shifts of the second photo and keeps the one where the two match best, so framing differences don't look like damage.",
  "The difference heatmap shows where the photos differ. Drag the split or switch views. A difference isn't automatically damage: shadows and straps differ too.",
  "Each region is a candidate, not a finding. Confirm what is real damage and reject the rest. Only confirmed marks go into the evidence.",
  "Before exporting, a checklist makes sure the packet is complete and says what the photos can and can't show.",
];

/** Deterministic synthetic suitcase photos. `damaged` adds a crack, a dent and scuffs; the second photo is also slightly shifted. */
function paint(ctx: CanvasRenderingContext2D, damaged: boolean) {
  const shiftX = damaged ? -9 : 0;
  const shiftY = damaged ? 6 : 0;
  ctx.save();
  ctx.fillStyle = damaged ? "#d3d9df" : "#d7dde3";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = damaged ? "#2d343b" : "#c5ccd3";
  ctx.fillRect(0, 285, W, 75);
  if (damaged) {
    ctx.fillStyle = "#3d454e";
    for (let x = 0; x < W; x += 40) ctx.fillRect(x, 285, 3, 75);
  }
  ctx.translate(shiftX, shiftY);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(240, 300, 110, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // handle
  ctx.fillStyle = "#28323c";
  ctx.fillRect(212, 18, 56, 10);
  ctx.fillStyle = "#7d8a96";
  ctx.fillRect(218, 26, 6, 34);
  ctx.fillRect(256, 26, 6, 34);
  // shell
  const g = ctx.createLinearGradient(150, 0, 330, 0);
  g.addColorStop(0, "#4b6073");
  g.addColorStop(0.5, "#3f5263");
  g.addColorStop(1, "#33424f");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(150, 58, 180, 230, 18);
  ctx.fill();
  ctx.fillStyle = "#5a6f82";
  for (const x of [192, 240, 288]) ctx.fillRect(x - 3, 74, 6, 198);
  ctx.fillStyle = "#2f3e4b";
  ctx.fillRect(150, 168, 180, 6);
  // wheels
  ctx.fillStyle = "#1c2329";
  ctx.beginPath();
  ctx.arc(175, 296, 11, 0, Math.PI * 2);
  ctx.arc(305, 296, 11, 0, Math.PI * 2);
  ctx.fill();
  if (damaged) {
    ctx.strokeStyle = "#eef2f5";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(326, 70);
    ctx.lineTo(312, 86);
    ctx.lineTo(320, 94);
    ctx.lineTo(302, 112);
    ctx.lineTo(309, 118);
    ctx.lineTo(294, 134);
    ctx.stroke();
    ctx.fillStyle = "rgba(20,28,36,0.65)";
    ctx.beginPath();
    ctx.ellipse(198, 228, 26, 18, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(220,226,232,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(250, 250);
    ctx.lineTo(282, 242);
    ctx.moveTo(256, 262);
    ctx.lineTo(292, 253);
    ctx.stroke();
  }
  ctx.restore();
}

type Verdict = "candidate" | "confirmed" | "rejected";

export function BagScenario() {
  const p = usePlayer(STEPS.length, 6500);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<{ dx: number; dy: number; regions: Region[]; heat: ImageData } | null>(null);
  const [view, setView] = useState<"split" | "heatmap" | "before" | "after">("split");
  const [split, setSplit] = useState(50);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [selected, setSelected] = useState<number | null>(null);

  // Reset clears everything the viewer changed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerdicts({});
    setSelected(null);
    setView("split");
    setSplit(50);
  }, [p.resetToken]);

  // Draw both photos and run the real comparison once.
  useEffect(() => {
    const b = beforeRef.current?.getContext("2d");
    const a = afterRef.current?.getContext("2d");
    if (!b || !a) return;
    paint(b, false);
    paint(a, true);
    // Analyse only the area above the floor: the floor is a different surface at check-in and at
    // the carousel, and it isn't part of the bag.
    const CROP = 280;
    const sw = 160;
    const sh = Math.round((sw * CROP) / W);
    const small = (src: HTMLCanvasElement) => {
      const c = document.createElement("canvas");
      c.width = sw;
      c.height = sh;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(src, 0, 0, W, CROP, 0, 0, sw, sh);
      return toGray(x.getImageData(0, 0, sw, sh).data, sw, sh);
    };
    const g1 = small(beforeRef.current!);
    const g2 = small(afterRef.current!);
    const s = align(g1, g2, 4);
    const d = diffMap(g1, g2, s.dx, s.dy, 1);
    // Region coordinates are relative to the analysed crop; convert them back to the full photo.
    const k = CROP / H;
    const found = regions(d, "auto", 0.003).map((r) => ({ ...r, y: r.y * k, h: r.h * k }));
    const heat = new ImageData(heatmapRgba(d), sw, sh);
    // One-time analysis of static canvases.
    setAnalysis({ dx: s.dx, dy: s.dy, regions: found, heat });
  }, []);

  useEffect(() => {
    const c = heatRef.current?.getContext("2d");
    if (!c || !analysis) return;
    c.putImageData(analysis.heat, 0, 0);
  }, [analysis]);

  const step = p.index;
  const showHeat = step >= 3 && (view === "heatmap" || view === "split");
  const confirmed = useMemo(() => Object.entries(verdicts).filter(([, v]) => v === "confirmed").map(([k]) => Number(k)), [verdicts]);
  const checklist = [
    { ok: true, label: "Check-in photo with original timestamp and hash" },
    { ok: true, label: "Carousel photo of the same angle" },
    { ok: Boolean(analysis), label: `Photos aligned (shift of ${analysis ? `${Math.abs(analysis.dx * 3)} px, ${Math.abs(analysis.dy * 3)} px` : "pending"})` },
    { ok: confirmed.length > 0, label: `${confirmed.length} damage mark${confirmed.length === 1 ? "" : "s"} confirmed by you` },
    { ok: analysis ? analysis.regions.every((_, i) => verdicts[i] && verdicts[i] !== "candidate") : false, label: "Every candidate reviewed (confirmed or rejected)" },
  ];

  function exportJson() {
    if (!analysis) return;
    const body = {
      simulated: true,
      note: "Simulated Demo Center output. The photos show the bag's condition at two times; they don't prove who caused a change.",
      alignment: { dx: analysis.dx, dy: analysis.dy, unit: "pixels at 160x120 analysis size" },
      findings: analysis.regions.map((r, i) => ({ region: { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }, score: round(r.score), status: verdicts[i] ?? "candidate", origin: "comparison" })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "claimwing-demo-bag-findings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="z-20 lg:sticky lg:top-[4.5rem]">
        <ControlBar p={p} labels={STEPS} title="Baggage damage investigation" />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-3xl border border-signal/30 bg-info-soft/60 p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-xs font-medium text-signal">
            <FlaskConical className="size-3.5" aria-hidden /> Simulated photos, step {step + 1} of {STEPS.length}
          </p>
          <p className="mt-1 font-display text-xl">{STEPS[step]}</p>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{NARRATION[step]}</p>
        </motion.div>
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-3xl border bg-card p-4 sm:p-5">
          {step >= 3 && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Comparison view">
              {(["split", "heatmap", "before", "after"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded-full border px-3 py-1 text-xs capitalize", view === v ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
                >
                  {v === "split" ? "Split view" : v === "heatmap" ? "Difference heatmap" : v === "before" ? "Check-in only" : "Carousel only"}
                </button>
              ))}
            </div>
          )}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
            <canvas ref={beforeRef} width={W} height={H} className="absolute inset-0 h-full w-full" aria-label="Simulated check-in photo of a hard-shell suitcase" role="img" />
            <motion.canvas
              ref={afterRef}
              width={W}
              height={H}
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label="Simulated carousel photo of the same suitcase with damage"
              animate={{ opacity: step === 0 || view === "before" ? 0 : 1, x: step === 2 && analysis ? [0, -analysis.dx * 2, -analysis.dx * 2] : 0 }}
              transition={{ duration: step === 2 ? 1.2 : 0.3 }}
              style={{ clipPath: step >= 3 && view === "split" ? `inset(0 0 0 ${split}%)` : step === 1 ? "inset(0 0 0 0)" : step === 2 ? "inset(0 0 0 50%)" : undefined }}
            />
            <canvas
              ref={heatRef}
              width={160}
              height={93}
              className={cn("pointer-events-none absolute inset-x-0 top-0 w-full transition-opacity duration-500", showHeat ? "opacity-100" : "opacity-0")}
              style={{ height: `${(280 / 360) * 100}%` }}
              aria-hidden
            />
            {step >= 3 && analysis && (
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                {analysis.regions.map((r, i) => (
                  <motion.rect
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: verdicts[i] === "rejected" ? 0.25 : 1 }}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill="none"
                    stroke={verdicts[i] === "confirmed" ? "#17794a" : verdicts[i] === "rejected" ? "#888" : "#ffd23f"}
                    strokeWidth={selected === i ? 0.008 : 0.005}
                    strokeDasharray={verdicts[i] === "confirmed" ? undefined : "0.015 0.01"}
                  />
                ))}
              </svg>
            )}
            {step >= 3 && view === "split" && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }} aria-hidden />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  aria-label="Split position between the check-in and carousel photos"
                  className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                />
              </>
            )}
            <span className="absolute left-2 top-2 rounded bg-white/85 px-2 py-0.5 text-[11px] font-medium text-[#0a1e4a]">Check-in, 06:12</span>
            {step >= 1 && view !== "before" && <span className="absolute right-2 top-2 rounded bg-[#0a1e4a]/85 px-2 py-0.5 text-[11px] font-medium text-white">Carousel, 17:48</span>}
          </div>
          {step === 2 && analysis && (
            <p className="mt-3 text-sm text-muted-foreground">
              Best match found by shifting the carousel photo {Math.abs(analysis.dx * 3)} px {analysis.dx > 0 ? "left" : "right"} and {Math.abs(analysis.dy * 3)} px {analysis.dy > 0 ? "up" : "down"}.
            </p>
          )}
          {step >= 3 && <p className="mt-3 text-xs text-muted-foreground">Keyboard: focus the photo and use the arrow keys to move the split.</p>}
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border bg-card p-5" aria-labelledby="bag-findings">
            <h3 id="bag-findings" className="text-xl">
              Findings
            </h3>
            {step < 4 ? (
              <p className="mt-2 text-sm text-muted-foreground">Candidates appear after the comparison. {analysis ? `${analysis.regions.length} found so far.` : ""}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {analysis?.regions.map((r, i) => {
                  const v = verdicts[i] ?? "candidate";
                  return (
                    <li key={i} className={cn("rounded-2xl border p-3 text-sm", selected === i && "ring-2 ring-signal/40")} onMouseEnter={() => setSelected(i)} onMouseLeave={() => setSelected(null)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">Region {i + 1}</span>
                        <Badge tone={v === "confirmed" ? "success" : v === "rejected" ? "neutral" : "warning"}>
                          {v === "confirmed" ? "Confirmed by you" : v === "rejected" ? "Rejected" : "Suggested by comparison"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Difference strength {Math.round(r.score * 100)} of 100, {Math.round(r.area * 1000) / 10}% of the photo
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant={v === "confirmed" ? "default" : "outline"} onClick={() => setVerdicts((x) => ({ ...x, [i]: "confirmed" }))} onFocus={() => setSelected(i)}>
                          <Check aria-hidden /> Damage
                        </Button>
                        <Button size="sm" variant={v === "rejected" ? "default" : "outline"} onClick={() => setVerdicts((x) => ({ ...x, [i]: "rejected" }))} onFocus={() => setSelected(i)}>
                          <X aria-hidden /> Not damage
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {step >= 5 && (
            <section className="rounded-3xl border bg-card p-5" aria-labelledby="bag-check">
              <h3 id="bag-check" className="text-xl">
                Before you export
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {checklist.map((c) => (
                  <li key={c.label} className="flex gap-2">
                    <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px]", c.ok ? "bg-success text-white" : "border")} aria-hidden>
                      {c.ok ? "✓" : ""}
                    </span>
                    <span className={c.ok ? "" : "text-muted-foreground"}>
                      {c.label}
                      <span className="sr-only">{c.ok ? " (done)" : " (not done)"}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">The photos show the bag at two moments. They don&apos;t prove who caused the change, and the packet says so.</p>
              <Button className="mt-3 w-full" onClick={exportJson} disabled={!checklist.every((c) => c.ok)}>
                <Download aria-hidden /> Export findings (simulated)
              </Button>
              {!checklist.every((c) => c.ok) && <p className="mt-2 text-xs text-muted-foreground">Review every candidate and confirm at least one to export.</p>}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
