"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:+£€$";
const TICK_MS = 45;

function pad(text: string, length: number) {
  return text.toUpperCase().slice(0, length).padEnd(length, " ");
}

/**
 * A run of split-flap cells. When `text` changes, each changed cell riffles
 * through a few characters before settling, left to right. The first render
 * on the server is already the final text, so nothing is hidden without JS.
 */
export function Flaps({
  text,
  length,
  className,
  startDelay = 0,
  label,
}: {
  text: string;
  length: number;
  className?: string;
  /** Extra ticks before this run starts flipping; used to cascade rows on load. */
  startDelay?: number;
  /** Accessible text; defaults to the trimmed value. */
  label?: string;
}) {
  const target = pad(text, length);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const firstRun = useRef(true);

  useEffect(() => {
    if (reduce) {
      shownRef.current = target;
      return;
    }
    const from = firstRun.current ? pad("", length) : shownRef.current;
    const initial = firstRun.current;
    firstRun.current = false;
    const steps = target.split("").map((c, i) => {
      if (!initial && from[i] === c) return 0;
      // Load: a longer, staggered riffle. Updates: quick, so dragging stays readable.
      return initial ? startDelay + 4 + i + ((i * 7) % 5) : 2 + (i % 3);
    });
    let tick = 0;
    let finished = false;
    const id = window.setInterval(() => {
      tick += 1;
      let done = true;
      const next = target
        .split("")
        .map((c, i) => {
          if (tick >= steps[i]) return c;
          done = false;
          if (initial && tick < startDelay) return from[i];
          return CHARS[(i * 11 + tick * 7) % CHARS.length];
        })
        .join("");
      shownRef.current = next;
      setShown(next);
      if (done) {
        finished = true;
        window.clearInterval(id);
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      // If the load riffle was interrupted (e.g. Strict Mode remount), run it again.
      if (initial && !finished) firstRun.current = true;
    };
  }, [target, length, reduce, startDelay]);

  const display = reduce ? target : shown;
  return (
    <span className={cn("inline-flex gap-[2px]", className)}>
      <span className="sr-only">{label ?? text}</span>
      {display.split("").map((c, i) => (
        <span key={i} className="flap" aria-hidden>
          {c === " " ? " " : c}
        </span>
      ))}
    </span>
  );
}
