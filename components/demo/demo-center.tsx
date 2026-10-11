"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, RotateCcw, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePlayer, type Player } from "./player";
import { RippleSlides, type Built } from "./ripple-scenario";
import { BAG_STEPS, BagScenario } from "./bag-scenario";
import { CLAIM_STEPS, ClaimScenario } from "./claim-scenario";
import { ALGOS } from "./how";

export type ScenarioCard = { id: string; title: string; summary: string; expected: string; kind: "ripple" | "bag" | "claim"; highlight?: number };

const SPEEDS = [0.5, 1, 2, 4];

/** One continuous slideshow: every scenario back to back, driven by a single Play button. */
export function DemoCenter({ scenarios }: { scenarios: ScenarioCard[] }) {
  const [data, setData] = useState<Record<string, Built> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rippleIds = useMemo(() => scenarios.filter((s) => s.kind === "ripple").map((s) => s.id), [scenarios]);

  useEffect(() => {
    let alive = true;
    Promise.all(
      rippleIds.map(async (id) => {
        const r = await fetch(`/api/demo/scenarios/${id}`);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load.");
        return [id, (await r.json()) as Built] as const;
      }),
    )
      .then((rows) => alive && setData(Object.fromEntries(rows)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load."));
    return () => {
      alive = false;
    };
  }, [rippleIds]);

  if (error) {
    return (
      <div role="alert" className="rounded-3xl border bg-card p-8 text-center text-sm">
        <p className="font-medium">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl border bg-card p-16 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="size-4 animate-spin" aria-hidden />
      </div>
    );
  }
  return <Slideshow scenarios={scenarios} data={data} />;
}

function Slideshow({ scenarios, data }: { scenarios: ScenarioCard[]; data: Record<string, Built> }) {
  const sections = useMemo(() => {
    let start = 0;
    return scenarios.map((s) => {
      const count = s.kind === "ripple" ? data[s.id].frames.length : s.kind === "bag" ? BAG_STEPS : CLAIM_STEPS;
      const sec = { ...s, start, count };
      start += count;
      return sec;
    });
  }, [scenarios, data]);
  const total = sections.reduce((n, s) => n + s.count, 0);

  const p = usePlayer(total, 5500);
  const si = Math.max(0, sections.findIndex((s) => p.index >= s.start && p.index < s.start + s.count));
  const sec = sections[si];

  // The scenario sees only its own slice of the timeline.
  const local: Player = { ...p, index: p.index - sec.start, done: p.index - sec.start >= sec.count - 1, goto: (i) => p.goto(sec.start + i) };

  // Keyboard: space toggles, arrows step. Ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " && !t.closest("button, a")) {
        e.preventDefault();
        p.toggle();
      } else if (e.key === "ArrowRight") p.next();
      else if (e.key === "ArrowLeft") p.prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);

  // Bring the stage into view whenever the slideshow moves to a new scenario.
  const stage = useRef<HTMLDivElement>(null);
  const lastSection = useRef(si);
  useEffect(() => {
    if (lastSection.current === si) return;
    lastSection.current = si;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [si]);

  const intro = !p.playing && p.index === 0;

  return (
    <div className="space-y-5">
      <div className="sticky top-[4.5rem] z-20 rounded-2xl border bg-card/95 p-3 backdrop-blur sm:p-4" role="group" aria-label="Demo playback controls">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={p.toggle} aria-label={p.playing ? "Pause" : "Play"} className="min-w-24">
            {p.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            {p.playing ? "Pause" : p.index > 0 && !p.done ? "Resume" : "Play"}
          </Button>
          <Button size="icon-sm" variant="outline" onClick={p.prev} disabled={p.index === 0} aria-label="Previous step">
            <ChevronLeft aria-hidden />
          </Button>
          <Button size="icon-sm" variant="outline" onClick={p.next} disabled={p.done} aria-label="Next step">
            <ChevronRight aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={p.restart} aria-label="Restart and play">
            <SkipBack aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={p.reset} aria-label="Reset">
            <RotateCcw aria-hidden />
          </Button>
          <span className="ml-auto hidden text-xs text-muted-foreground md:inline" aria-hidden>
            Space play · ← → step
          </span>
          <select value={p.speed} onChange={(e) => p.setSpeed(Number(e.target.value))} aria-label="Speed" className="rounded-lg border bg-background px-2 py-1 text-xs text-foreground">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </div>

        <ol className="mt-3 flex gap-1" aria-label="Scenarios">
          {sections.map((s, i) => {
            const fill = i < si ? 100 : i === si ? ((p.index - s.start + 1) / s.count) * 100 : 0;
            return (
              <li key={s.id} className="min-w-0" style={{ flexGrow: s.count, flexBasis: 0 }}>
                <button type="button" onClick={() => p.goto(s.start)} aria-current={i === si ? "step" : undefined} className="group block w-full text-left">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-signal transition-[width] duration-500" style={{ width: `${fill}%` }} />
                  </span>
                  <span className={cn("mt-1.5 block truncate text-[11px]", i === si ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <AnimatePresence initial={false}>
        {intro && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} className="flex flex-col items-center gap-4 rounded-3xl border border-signal/30 bg-info-soft/60 p-8 text-center">
            <p className="font-display text-2xl sm:text-3xl">Press play</p>
            <Button size="lg" variant="signal" onClick={p.play}>
              <Play aria-hidden /> Play
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={stage} className="scroll-mt-44 space-y-5">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-3xl">
            <span className="mr-2 font-mono text-base text-muted-foreground">
              {si + 1}/{sections.length}
            </span>
            {sec.title}
          </h2>
          <ul className="flex flex-wrap gap-1.5" aria-label="Algorithms">
            {(ALGOS[sec.id] ?? []).map((a) => (
              <li key={a} className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium">
                {a}
              </li>
            ))}
          </ul>
        </header>
        {sec.kind === "ripple" && <RippleSlides key={sec.id} data={data[sec.id]} p={local} />}
        {sec.kind === "bag" && <BagScenario key="bag" p={local} />}
        {sec.kind === "claim" && <ClaimScenario key="claim" p={local} />}
      </div>
    </div>
  );
}
