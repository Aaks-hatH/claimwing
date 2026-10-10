"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import type { PhotoView } from "@/lib/baggage";
import { align, diffMap, heatmapRgba, regions, toGray, type Region } from "@/lib/vision/diff";
import { Button } from "@/components/ui/button";
import { Explain } from "@/components/help/term";
import { cn } from "@/lib/utils";

type Rect = { x: number; y: number; w: number; h: number };
type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; dx: number; dy: number; regions: Region[]; aspectWarning: boolean; heat: ImageData; w: number; h: number };

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("A photo couldn't be loaded for comparison."));
    img.src = url;
  });
}

/**
 * In-browser comparison of the before and after photo for one angle: alignment, a difference
 * heatmap, and candidate regions the passenger can add as unconfirmed suggestions.
 * Nothing is uploaded; the photos never leave the page for this step.
 */
export function DifferenceView({ before, after, onAddSuggestion, existing }: { before: PhotoView; after: PhotoView; onAddSuggestion: (r: Rect) => Promise<void>; existing: Rect[] }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [layer, setLayer] = useState<"heatmap" | "aligned" | "before" | "after">("heatmap");
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const heatRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, b] = await Promise.all([loadImage(before.url), loadImage(after.url)]);
        const w = 240;
        const h = Math.max(60, Math.round((w * a.naturalHeight) / a.naturalWidth));
        const gray = (img: HTMLImageElement) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const x = c.getContext("2d", { willReadFrequently: true })!;
          x.drawImage(img, 0, 0, w, h);
          return toGray(x.getImageData(0, 0, w, h).data, w, h);
        };
        // Yield to the browser so the loading state paints before the heavier work.
        await new Promise((r) => setTimeout(r, 30));
        const g1 = gray(a);
        const g2 = gray(b);
        const s = align(g1, g2, 8);
        const d = diffMap(g1, g2, s.dx, s.dy, 1);
        const found = regions(d, "auto", 0.0012);
        const aspectWarning = Math.abs(a.naturalWidth / a.naturalHeight - b.naturalWidth / b.naturalHeight) > 0.05;
        if (!cancelled) setState({ status: "ready", dx: s.dx, dy: s.dy, regions: found, aspectWarning, heat: new ImageData(heatmapRgba(d), w, h), w, h });
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : "The comparison failed." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [before.url, after.url]);

  useEffect(() => {
    if (state.status !== "ready") return;
    heatRef.current?.getContext("2d")?.putImageData(state.heat, 0, 0);
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="flex aspect-[4/3] items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Comparing the two photos in your browser
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
        <AlertTriangle className="size-4" aria-hidden /> {state.message} Try the slider view instead.
      </p>
    );
  }

  const overlaps = (r: Region) => existing.some((e) => !(e.x > r.x + r.w || e.x + e.w < r.x || e.y > r.y + r.h || e.y + e.h < r.y));
  const pctX = (state.dx / state.w) * 100;
  const pctY = (state.dy / state.h) * 100;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Comparison layer">
        {(["heatmap", "aligned", "before", "after"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={layer === l} onClick={() => setLayer(l)} className={cn("rounded-full border px-3 py-1 text-xs", layer === l ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
            {l === "heatmap" ? "Difference heatmap" : l === "aligned" ? "Aligned overlay" : l === "before" ? "Before" : "After"}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-lg border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={layer === "after" ? after.url : before.url} alt={layer === "after" ? "After photo" : "Before photo"} className="block w-full select-none" draggable={false} />
        {layer === "aligned" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={after.url}
            alt=""
            aria-hidden
            className="absolute inset-0 block size-full object-cover opacity-50 mix-blend-difference"
            style={{ transform: `translate(${-pctX}%, ${-pctY}%)` }}
            draggable={false}
          />
        )}
        <canvas ref={heatRef} width={state.w} height={state.h} className={cn("pointer-events-none absolute inset-0 size-full transition-opacity duration-300", layer === "heatmap" ? "opacity-100" : "opacity-0")} aria-hidden />
        {state.regions.map((r, i) => (
          <motion.button
            key={i}
            type="button"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 * i }}
            onClick={() => setSelected((s) => (s === i ? null : i))}
            aria-pressed={selected === i}
            aria-label={`Candidate area ${i + 1}`}
            className={cn("absolute rounded-sm border-2 border-dashed", selected === i ? "border-white bg-white/10" : "border-[#ffd23f]")}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          >
            <span className="absolute -top-5 left-0 rounded bg-[#ffd23f] px-1 text-[10px] font-semibold text-black">{i + 1}</span>
          </motion.button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Aligned by shifting the after photo {Math.abs(state.dx)} px {state.dx >= 0 ? "left" : "right"} and {Math.abs(state.dy)} px {state.dy >= 0 ? "up" : "down"} at comparison size.
        {state.aspectWarning ? " The two photos have different shapes, so the comparison is less reliable; retake the after photo using the overlay guide if you can." : ""}
      </p>
      {state.regions.length ? (
        <ul className="space-y-2">
          {state.regions.map((r, i) => (
            <li key={i} className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm", selected === i && "ring-2 ring-signal/40")}>
              <span className="flex size-5 items-center justify-center rounded bg-[#ffd23f] text-[11px] font-semibold text-black">{i + 1}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">
                Differs between the photos (strength {Math.round(r.score * 100)} of 100)
              </span>
              {overlaps(r) ? (
                <span className="text-xs text-muted-foreground">Already marked</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={adding === i}
                  onClick={async () => {
                    setAdding(i);
                    try {
                      await onAddSuggestion({ x: r.x, y: r.y, w: r.w, h: r.h });
                    } finally {
                      setAdding(null);
                    }
                  }}
                >
                  {adding === i ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Add as suggestion
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No clear differences found. Damage can still be there: zoom in on the slider view and mark it yourself.</p>
      )}
      <Explain label="How does the comparison work?">
        Both photos are shrunk and turned to grayscale in your browser. The after photo is shifted a few pixels at a time until it best matches the before photo, then the remaining differences are smoothed and mapped. Bright areas differ most. Shadows, straps, reflections and different backgrounds also show up, so every area is only a suggestion until you confirm it.
      </Explain>
    </div>
  );
}
