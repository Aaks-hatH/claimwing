"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { HelpCircle, Plane } from "lucide-react";
import type { LegView, RippleResult } from "@/lib/ripple/engine";
import { Term } from "@/components/help/term";
import { cn } from "@/lib/utils";
import { LEG_STATE, localTime, rangeText, type AirportInfo } from "./format";

const ROLE_LABEL: Record<LegView["role"], string> = { incoming: "Incoming aircraft", target: "Your flight", downstream: "Next flight" };
const OUTCOME = {
  absorbed: { label: "Buffer absorbs it", line: "bg-success", text: "text-success" },
  tight: { label: "Tight turnaround", line: "bg-warning", text: "text-warning" },
  propagates: { label: "Delay carries over", line: "bg-danger", text: "text-danger" },
} as const;

function legKey(l: LegView) {
  return `${l.flightNumber}|${l.date}|${l.origin}`;
}

/**
 * The aircraft's day as connected nodes: incoming flight, turnaround, your flight, later legs.
 * Observed, estimated and predicted states look different, and unknown links are drawn as unknown.
 * The plane marker only appears on a leg the data says is airborne.
 */
export function RotationGraph({
  rotation,
  airports,
  selected,
  onSelect,
  animateKey,
}: {
  rotation: RippleResult["rotation"];
  airports: AirportInfo;
  selected: string | null;
  onSelect: (key: string) => void;
  animateKey: string;
}) {
  const { legs, links } = rotation;
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 896));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const target = legs.find((l) => l.role === "target");
  const hasIncoming = legs.some((l) => l.role === "incoming");

  return (
    <div ref={ref} className="@container -mx-1 overflow-x-auto pb-2">
      <ol className="flex flex-col items-stretch gap-0 px-1 @4xl:flex-row @4xl:items-center" aria-label="Aircraft rotation">
        {!hasIncoming && <UnknownNode label={rotation.confidence === "unknown" ? "Incoming aircraft unknown" : "No earlier leg listed"} />}
        {!hasIncoming && <Connector unknown />}
        {legs.map((leg, i) => {
          const link = i > 0 ? links.find((l) => l.toFlight === leg.flightNumber && l.fromFlight === legs[i - 1].flightNumber) : null;
          const k = legKey(leg);
          return (
            <Fragment key={k}>
              {i > 0 && <Connector link={link ?? null} animateKey={animateKey} airport={leg.origin} wide={wide} />}
              <motion.li
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i, 4) * 0.06 }}
                className="@4xl:min-w-0 @4xl:flex-1"
              >
                <LegNode leg={leg} airports={airports} selected={selected === k} onSelect={() => onSelect(k)} />
              </motion.li>
            </Fragment>
          );
        })}
        {!target && <UnknownNode label="Your flight" />}
        {!legs.some((l) => l.role === "downstream") && (
          <>
            <Connector unknown />
            <UnknownNode label={rotation.confidence === "unknown" ? "Next flight unknown" : "No later leg listed"} />
          </>
        )}
      </ol>
    </div>
  );
}

function LegNode({ leg, airports, selected, onSelect }: { leg: LegView; airports: AirportInfo; selected: boolean; onSelect: () => void }) {
  const state = leg.arrivalDelay?.state ?? (leg.status === "scheduled" ? "scheduled" : "none");
  const s = LEG_STATE[state];
  const airborne = leg.status === "in_air";
  const otz = airports[leg.origin]?.tz;
  const dtz = airports[leg.destination]?.tz;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative w-full rounded-2xl border-2 bg-card p-3.5 text-left transition-[box-shadow,transform] hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
        s.className,
        leg.role === "target" && "ring-2 ring-signal/30",
        selected && "shadow-[0_0_0_3px_color-mix(in_srgb,var(--signal)_35%,transparent)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{ROLE_LABEL[leg.role]}</span>
        {airborne && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-signal">
            <motion.span
              animate={{ x: [0, 3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex"
              aria-hidden
            >
              <Plane className="size-3.5" />
            </motion.span>
            In the air
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-base font-semibold tracking-wide">{leg.flightNumber}</p>
      <p className="text-sm">
        {leg.origin} <span className="text-muted-foreground">to</span> {leg.destination}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {localTime(leg.scheduledDeparture, otz)} to {localTime(leg.scheduledArrival, dtz)} scheduled
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2 text-xs">
        <span className="font-medium">{s.label}</span>
        <span className={cn("tabular-nums", (leg.arrivalDelay?.mid ?? 0) >= 15 ? "text-danger" : "text-muted-foreground")}>
          {leg.arrivalDelay ? rangeText(leg.arrivalDelay) : "No estimate"}
        </span>
      </div>
    </button>
  );
}

function Connector({ link, unknown, animateKey, airport, wide = false }: { link?: RippleResult["rotation"]["links"][number] | null; unknown?: boolean; animateKey?: string; airport?: string; wide?: boolean }) {
  if (unknown || !link) {
    return (
      <li aria-hidden className="flex h-10 items-center justify-center @4xl:h-auto @4xl:w-10 @4xl:shrink-0">
        <span className="h-full w-0 border-l-2 border-dotted border-border @4xl:h-0 @4xl:w-full @4xl:border-l-0 @4xl:border-t-2" />
      </li>
    );
  }
  const o = link.step ? OUTCOME[link.step.outcome] : null;
  return (
    <li className="relative flex items-center gap-3 py-2 pl-5 @4xl:w-32 @4xl:shrink-0 @4xl:flex-col @4xl:gap-1 @4xl:px-1 @4xl:py-0">
      <div className="relative flex h-14 w-6 items-center justify-center @4xl:h-6 @4xl:w-full">
        <span className={cn("absolute h-full w-[3px] rounded-full @4xl:h-[3px] @4xl:w-full", o ? o.line : "bg-border", !link.step && "opacity-60")} />
        {link.step?.outcome === "propagates" && (
          <motion.span
            key={animateKey}
            aria-hidden
            className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 rounded-full bg-danger shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_25%,transparent)] @4xl:left-0 @4xl:top-1/2 @4xl:-translate-y-1/2"
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], ...(wide ? { x: [0, 120] } : { y: [0, 50] }) }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
          />
        )}
      </div>
      <div className="min-w-0 text-[11px] leading-snug @4xl:text-center">
        <p className="font-medium">
          <Term id="turnaround">Turnaround</Term> at {airport}
        </p>
        <p className="text-muted-foreground">
          {link.scheduledGroundMin} min scheduled, needs {link.turnaround.low} to {link.turnaround.high}
        </p>
        {o && <p className={cn("font-medium", o.text)}>{o.label}</p>}
        {!link.step && <p className="text-muted-foreground">Effect unknown</p>}
      </div>
    </li>
  );
}

function UnknownNode({ label }: { label: string }) {
  return (
    <li className="@4xl:w-40 @4xl:shrink-0">
      <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dotted border-border p-3 text-center text-xs text-muted-foreground">
        <HelpCircle className="size-4" aria-hidden />
        {label}
      </div>
    </li>
  );
}
