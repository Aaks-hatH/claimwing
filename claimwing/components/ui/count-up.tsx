"use client";

import { useEffect, useRef, useState } from "react";

const NUM = /\d[\d,]*(?:\.\d+)?/g;

function render(template: string, progress: number) {
  return template.replace(NUM, (m) => {
    const decimals = m.includes(".") ? m.split(".")[1].length : 0;
    const target = Number(m.replace(/,/g, ""));
    const v = target * progress;
    return m.includes(",")
      ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : v.toFixed(decimals);
  });
}

/** Counts the numbers inside a string (e.g. "€600 + £260") up from zero once it scrolls into view. */
export function CountUp({ value, duration = 1100, className }: { value: string | number; duration?: number; className?: string }) {
  const text = String(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el || !/\d/.test(text) || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setShown(t < 1 ? render(text, eased) : text);
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [text, duration]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
