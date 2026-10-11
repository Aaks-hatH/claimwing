"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Loader2, Sparkles } from "lucide-react";
import type { SimFrame, ScenarioMeta } from "@/lib/ripple/sim/scenarios";
import { RippleView } from "@/components/ripple/ripple-view";
import { Button } from "@/components/ui/button";
import { ControlBar, usePlayer, type Player } from "./player";
import { HowCard, RIPPLE_HOW } from "./how";

export type Built = { meta: ScenarioMeta; frames: SimFrame[]; airports: Record<string, { tz: string; city: string | null; name: string }>; model: { version: string } | null };

/** Plays a simulated Flight Ripple scenario through the real interface. */
export function RippleScenario({ id, highlight }: { id: string; highlight?: number }) {
  const [data, setData] = useState<Built | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/demo/scenarios/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load.");
        return r.json();
      })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load."));
    return () => {
      alive = false;
    };
  }, [id]);

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
  return <RippleSlides key={id} data={data} highlight={highlight} />;
}

/** Pass `p` to drive the scenario from an outer slideshow (its own controls are then hidden). */
export function RippleSlides({ data, highlight, p: ext }: { data: Built; highlight?: number; p?: Player }) {
  const own = usePlayer(data.frames.length, 6000);
  const p = ext ?? own;
  const f = data.frames[p.index];
  const scrolledFor = useRef(-1);

  // Guided spotlight: bring the section this step is about into view (smoothly, unless reduced motion).
  useEffect(() => {
    if (scrolledFor.current === p.index || p.index === 0) return;
    scrolledFor.current = p.index;
    const el = document.querySelector<HTMLElement>('[data-spotlight="spotlight"]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.top > window.innerHeight * 0.6) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [p.index]);

  return (
    <div className="space-y-5">
      {!ext && (
        <div className="z-20 lg:sticky lg:top-[4.5rem] space-y-3">
          <ControlBar p={p} labels={data.frames.map((x) => x.label)} title={data.meta.title} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!ext && highlight !== undefined && p.index !== highlight && (
          <Button size="sm" variant="signal" onClick={() => p.goto(highlight)}>
            <Sparkles aria-hidden /> Key moment
          </Button>
        )}
      </div>
      <RippleView
        result={f.result}
        changes={f.changes}
        previousAt={p.index > 0 ? data.frames[p.index - 1].at : null}
        airports={data.airports}
        now={new Date(f.at)}
        mode="simulation"
        spotlight={f.spotlight}
        banner={
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={p.index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="rounded-3xl border border-signal/30 bg-info-soft/60 p-5"
              aria-live="polite"
            >
              <p className="flex items-center gap-2 text-xs font-medium text-signal">
                <FlaskConical className="size-3.5" aria-hidden /> {p.index + 1}/{data.frames.length} · {new Date(f.at).toISOString().slice(11, 16)} UTC
              </p>
              <p className="mt-1 font-display text-xl">{f.label}</p>
              <p className="mt-1 max-w-[50ch] text-base">{f.narration}</p>
              <HowCard how={RIPPLE_HOW[`${data.meta.id}:${f.label}`]} />
            </motion.div>
          </AnimatePresence>
        }
      />
    </div>
  );
}
