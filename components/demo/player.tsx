"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Player = {
  index: number;
  playing: boolean;
  speed: number;
  done: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  reset: () => void;
  next: () => void;
  prev: () => void;
  goto: (i: number) => void;
  setSpeed: (s: number) => void;
  /** Bumps when the scenario is reset, so scenario components can clear their own state. */
  resetToken: number;
};

/**
 * Deterministic stepper. Pausing freezes on the current step; restarting returns to step 0 and plays;
 * resetting returns to step 0, paused, and clears anything the viewer changed.
 */
export function usePlayer(count: number, baseMs = 5200, initial = 0): Player {
  const [index, setIndex] = useState(Math.min(initial, Math.max(0, count - 1)));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [resetToken, setResetToken] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    if (index >= count - 1) {
      // Reached the last step: stop where we are.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      return;
    }
    timer.current = window.setTimeout(() => setIndex((i) => Math.min(count - 1, i + 1)), baseMs / speed);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [playing, index, count, baseMs, speed]);

  const goto = useCallback((i: number) => setIndex(Math.max(0, Math.min(count - 1, i))), [count]);
  return {
    index,
    playing,
    speed,
    done: index >= count - 1,
    play: () => {
      if (index >= count - 1) setIndex(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    toggle: () => (playing ? setPlaying(false) : (index >= count - 1 && setIndex(0), setPlaying(true))),
    restart: () => {
      setIndex(0);
      setPlaying(true);
    },
    reset: () => {
      setPlaying(false);
      setIndex(0);
      setResetToken((t) => t + 1);
    },
    next: () => (setPlaying(false), goto(index + 1)),
    prev: () => (setPlaying(false), goto(index - 1)),
    goto: (i) => (setPlaying(false), goto(i)),
    setSpeed,
    resetToken,
  };
}

const SPEEDS = [0.5, 1, 2, 4];

export function ControlBar({ p, labels, title }: { p: Player; labels: string[]; title: string }) {
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

  const pct = labels.length > 1 ? (p.index / (labels.length - 1)) * 100 : 100;
  return (
    <div className="rounded-2xl border bg-card p-3 sm:p-4" role="group" aria-label={`${title} playback controls`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={p.toggle} aria-label={p.playing ? "Pause" : p.index > 0 && !p.done ? "Resume" : "Play"} className="min-w-24">
          {p.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          {p.playing ? "Pause" : "Play"}
        </Button>
        <Button size="icon-sm" variant="outline" onClick={p.prev} disabled={p.index === 0} aria-label="Previous event">
          <ChevronLeft aria-hidden />
        </Button>
        <Button size="icon-sm" variant="outline" onClick={p.next} disabled={p.done} aria-label="Next event">
          <ChevronRight aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={p.restart} aria-label="Restart from the beginning and play">
          <SkipBack aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={p.reset} aria-label="Reset to the starting state">
          <RotateCcw aria-hidden />
        </Button>
        <span className="ml-auto hidden text-xs text-muted-foreground md:inline" aria-hidden>
          Space play · ← → step
        </span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <select value={p.speed} onChange={(e) => p.setSpeed(Number(e.target.value))} className="rounded-lg border bg-background px-2 py-1 text-xs text-foreground">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <div className="relative h-1.5 rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={labels.length} aria-valuenow={p.index + 1} aria-valuetext={`Event ${p.index + 1} of ${labels.length}: ${labels[p.index]}`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-signal transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Scenario events">
          {labels.map((l, i) => (
            <li key={i} className="shrink-0">
              <button
                type="button"
                onClick={() => p.goto(i)}
                aria-current={i === p.index ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  i === p.index ? "border-foreground bg-foreground text-background" : i < p.index ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="font-mono">{i + 1}</span>
                <span className="sr-only">{l}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
