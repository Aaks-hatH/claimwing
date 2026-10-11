"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.75, 0.25, 1] as const;

/** Fades, lifts and un-blurs its children the first time they scroll into view. */
export function Reveal({ children, className, delay = 0, y = 28 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Small mono label above a section heading, e.g. "02 / Bags". */
export function Eyebrow({ n, children, className }: { n: string; children: ReactNode; className?: string }) {
  return (
    <Reveal className={cn("eyebrow mb-5 flex items-center gap-3 text-xs text-muted-foreground", className)} y={12}>
      <span className="text-foreground">{n}</span>
      <span aria-hidden className="h-[2px] w-8 bg-current opacity-40" />
      <span>{children}</span>
    </Reveal>
  );
}

function parse(text: string) {
  const tokens: { w: string; accent: boolean }[] = [];
  text.split("*").forEach((seg, i) => seg.split(/\s+/).filter(Boolean).forEach((w) => tokens.push({ w, accent: i % 2 === 1 })));
  return tokens;
}

function Word({ p, range, accent, accentClassName, children }: { p: MotionValue<number>; range: [number, number]; accent: boolean; accentClassName?: string; children: ReactNode }) {
  const opacity = useTransform(p, range, [0.14, 1]);
  const y = useTransform(p, range, [14, 0]);
  return (
    <motion.span style={{ opacity, y }} className={cn("mr-[0.2em] inline-block", accent && cn("font-[760]", accentClassName))}>
      {children}
    </motion.span>
  );
}

/**
 * A heading that fills in word by word as you scroll it into place.
 * Wrap words in *asterisks* to set them in the italic serif accent.
 */
export function ScrollHeading({ text, as: Tag = "h2", className, accentClassName, fillBy = 0.4 }: { text: string; as?: "h1" | "h2" | "h3"; className?: string; accentClassName?: string; /** Viewport height fraction (from the top) at which the heading is fully filled in. Raise it for a heading near the page end. */ fillBy?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.92", `start ${fillBy}`] });
  const words = parse(text);
  if (reduce) {
    return (
      <Tag className={className}>
        {words.map((t, i) => (
          <span key={i} className={cn("mr-[0.2em] inline-block", t.accent && cn("font-[760]", accentClassName))}>
            {t.w}
          </span>
        ))}
      </Tag>
    );
  }
  return (
    <div ref={ref}>
      <Tag className={className} aria-label={words.map((t) => t.w).join(" ")}>
        {words.map((t, i) => {
          const a = (i / words.length) * 0.75;
          return (
            <Word key={i} p={scrollYProgress} range={[a, a + 0.25]} accent={t.accent} accentClassName={accentClassName}>
              {t.w}
            </Word>
          );
        })}
      </Tag>
    </div>
  );
}

/** A vertical timeline whose line draws as you scroll and whose steps arrive one at a time. */
export function ScrollTimeline({ steps }: { steps: { when: string; title: string }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.7", "end 0.65"] });
  const fill = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.5 });
  return (
    <ol ref={ref} className="relative space-y-16 pl-14 md:space-y-20">
      <span aria-hidden className="absolute bottom-2 left-[17px] top-2 w-[2px] bg-border" />
      <motion.span aria-hidden style={{ scaleY: fill }} className="absolute bottom-2 left-[17px] top-2 w-[2px] origin-top bg-foreground" />
      {steps.map((s, i) => (
        <motion.li key={s.when} className="relative" initial={{ opacity: 0, x: -28 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "0px 0px -22% 0px" }} transition={{ duration: 0.8, ease: EASE }}>
          <motion.span
            aria-hidden
            className="absolute -left-14 top-1 flex size-9 items-center justify-center rounded-[2px] bg-foreground font-mono text-xs font-semibold text-background ring-4 ring-background"
            initial={{ scale: 0.4 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, margin: "0px 0px -22% 0px" }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
          >
            {i + 1}
          </motion.span>
          <p className="eyebrow text-xs text-muted-foreground">{s.when}</p>
          <h3 className="stretch-display mt-2 text-3xl leading-[1] md:text-5xl">{s.title}</h3>
        </motion.li>
      ))}
    </ol>
  );
}

/** The sample evidence packet: drifts at a different speed to the page, rows land in turn, then it is stamped. */
export function PacketCard({ title, rows }: { title: string; rows: [string, string][] }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const back = useTransform(scrollYProgress, [0, 1], [-2, 10]);
  const backY = useTransform(scrollYProgress, [0, 1], [30, -20]);
  const front = useTransform(scrollYProgress, [0, 1], [50, -50]);
  return (
    <figure ref={ref} className="relative mx-auto w-full max-w-md lg:mx-0">
      <motion.div aria-hidden style={{ rotate: back, y: backY, x: 12 }} className="absolute inset-0 rounded-[2px] border-2 bg-secondary" />
      <motion.div style={{ y: front }} className="relative rounded-[2px] border-2 bg-card p-6 text-card-foreground sm:p-8">
        <div className="flex items-center justify-between border-b pb-4">
          <span className="eyebrow text-[11px] text-muted-foreground">Evidence packet</span>
          <span className="rounded-[2px] bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">Sample</span>
        </div>
        <p className="stretch-semi mt-5 text-2xl leading-[1.05]">{title}</p>
        <dl className="mt-5 divide-y text-sm">
          {rows.map(([k, v], i) => (
            <motion.div key={k} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2" initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "0px 0px -8% 0px" }} transition={{ duration: 0.6, delay: i * 0.07, ease: EASE }}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </motion.div>
          ))}
        </dl>
        <motion.div
          className="eyebrow absolute -right-3 -top-4 rounded-[2px] border-2 border-foreground bg-card px-3 py-1 text-[10px] font-semibold text-foreground"
          initial={{ scale: 2.4, opacity: 0, rotate: -24 }}
          whileInView={{ scale: 1, opacity: 1, rotate: -8 }}
          viewport={{ once: true, margin: "0px 0px -20% 0px" }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.9 }}
        >
          SHA-256 sealed
        </motion.div>
      </motion.div>
    </figure>
  );
}

/** Oversized words that slide sideways with the page scroll. */
export function ScrollMarquee({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const x = useTransform(scrollY, [0, 3000], [0, -1100]);
  const row = [...items, ...items, ...items, ...items];
  return (
    <div aria-hidden className="select-none overflow-hidden border-y-2 bg-background py-5 md:py-7">
      <motion.div style={{ x: reduce ? 0 : x }} className="stretch-display flex w-max items-center gap-8 whitespace-nowrap text-6xl md:gap-14 md:text-8xl">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-8 md:gap-14">
            <span className={cn(i % 2 === 1 && "text-transparent [-webkit-text-stroke:1.5px_var(--foreground)]")}>{t}</span>
            <span className="size-3 shrink-0 bg-current opacity-60 md:size-4" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}
