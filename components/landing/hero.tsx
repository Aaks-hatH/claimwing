"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.75, 0.25, 1] as const;

/* The flight path: one cubic curve in a 400 x 280 box. */
const P = [
  [30, 240],
  [100, 24],
  [300, 24],
  [370, 220],
] as const;
const PATH = `M${P[0][0]} ${P[0][1]} C${P[1][0]} ${P[1][1]} ${P[2][0]} ${P[2][1]} ${P[3][0]} ${P[3][1]}`;

function bez(t: number) {
  const u = 1 - t;
  const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
  const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
  const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
  const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

const START = 0.12;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
function readout(t: number) {
  const k = clamp((t - START) / (1 - START));
  const mins = Math.round(k * 219);
  return {
    delay: mins === 0 ? "On time" : `+${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`,
    status: k < 0.15 ? "Tracking" : k < 0.7 ? "Delayed" : "Eligible",
    est: k > 0.85,
  };
}

function RiseWord({ children, delay, className }: { children: React.ReactNode; delay: number; className?: string }) {
  return (
    <span className="inline-block overflow-hidden pb-[0.12em] pr-[0.1em] align-bottom">
      <motion.span className={cn("inline-block will-change-transform", className)} initial={{ y: "115%", rotate: 5 }} animate={{ y: 0, rotate: 0 }} transition={{ duration: 1.05, delay, ease: EASE }}>
        {children}
      </motion.span>
    </span>
  );
}

export function Hero({ startHref }: { startHref: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const titleY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const cloudA = useTransform(scrollYProgress, [0, 1], [0, -180]);
  const cloudB = useTransform(scrollYProgress, [0, 1], [0, -70]);
  const cloudC = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const rings = useTransform(scrollYProgress, [0, 1], [1, 1.7]);
  const cardY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  // Flight progress: glides in on load, then follows the scroll.
  const intro = useMotionValue(0);
  const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.4 });
  const planeRef = useRef<SVGGElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const delayRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const estRef = useRef<HTMLSpanElement>(null);

  const apply = () => {
    const t = reduce ? 0.9 : intro.get() + clamp(smooth.get() / 0.8) * (1 - START);
    const { x, y, angle } = bez(t);
    planeRef.current?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
    if (trailRef.current) trailRef.current.style.strokeDasharray = `${t.toFixed(3)} 1`;
    const r = readout(t);
    if (delayRef.current) delayRef.current.textContent = r.delay;
    if (statusRef.current) {
      statusRef.current.textContent = r.status;
      statusRef.current.dataset.state = r.status;
    }
    if (estRef.current) estRef.current.style.opacity = r.est ? "1" : "0.18";
  };
  useMotionValueEvent(smooth, "change", apply);
  useMotionValueEvent(intro, "change", apply);
  useEffect(() => {
    apply();
    if (reduce) return;
    const c = animate(intro, START, { duration: 2.2, delay: 0.7, ease: EASE });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const start = bez(0);
  const first = readout(0);

  return (
    <section ref={ref} className="landing-hero relative overflow-hidden">
      {/* Sky: soft clouds drifting at different speeds, and rings that widen as you leave. */}
      <motion.div aria-hidden style={{ y: reduce ? 0 : cloudA }} className="pointer-events-none absolute -left-24 top-24 h-56 w-[34rem] rounded-full bg-white/80 blur-3xl" />
      <motion.div aria-hidden style={{ y: reduce ? 0 : cloudB }} className="pointer-events-none absolute right-[-8rem] top-10 h-72 w-[40rem] rounded-full bg-white/70 blur-3xl" />
      <motion.div aria-hidden style={{ y: reduce ? 0 : cloudC }} className="pointer-events-none absolute bottom-0 left-1/3 h-48 w-[36rem] rounded-full bg-white/90 blur-3xl" />
      <motion.div aria-hidden style={{ scale: reduce ? 1 : rings }} className="pointer-events-none absolute right-[8%] top-[18%] hidden size-[34rem] rounded-full border border-signal/20 lg:block">
        <span className="absolute inset-10 rounded-full border border-signal/15" />
        <span className="absolute inset-24 rounded-full border border-signal/10" />
      </motion.div>

      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-4 pb-20 pt-32 md:px-8 md:pt-36">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.3fr)_minmax(19rem,0.8fr)] lg:items-center">
          <motion.div style={reduce ? undefined : { y: titleY, opacity: titleOpacity }}>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }} className="hero-kicker">
              Live flight record · Free
            </motion.p>

            <h1 className="hero-title mt-7">
              <span className="block">
                <RiseWord delay={0.2}>Build</RiseWord> <RiseWord delay={0.28}>your</RiseWord>
              </span>
              <span className="block">
                <RiseWord delay={0.36}>claim</RiseWord>
              </span>
              <span className="block">
                <RiseWord delay={0.5} className="accent">
                  in the air.
                </RiseWord>
              </span>
            </h1>

            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.85, ease: EASE }} className="mt-9 max-w-[30ch] text-lg leading-8 text-muted-foreground md:text-xl">
              Your flight, tracked. One evidence packet, ready when it lands late.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 1, ease: EASE }} className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild variant="signal" size="lg">
                <Link href={startHref}>
                  Start <ArrowUpRight size={17} aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#board">Try it</a>
              </Button>
              <Link href="/demo" className="ml-1 text-sm font-medium underline decoration-signal decoration-2 underline-offset-[6px]">
                Watch the demo
              </Link>
            </motion.div>
          </motion.div>

          <motion.div style={reduce ? undefined : { y: cardY }} initial={{ opacity: 0, y: 40, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 1.1, delay: 0.5, ease: EASE }} className="relative">
            <div className="rounded-[2rem] border border-signal/15 bg-white/70 p-5 shadow-[0_40px_90px_-40px_rgba(11,99,255,0.45)] backdrop-blur-xl sm:p-6" aria-label="Flight tracking, animated as you scroll">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                <strong className="inline-flex items-center gap-1.5 font-semibold text-signal">
                  <Radio size={13} aria-hidden /> Live
                </strong>
                <span>BA178 · JFK → LHR</span>
              </div>

              <svg viewBox="0 0 400 280" className="mt-2 w-full overflow-visible" aria-hidden>
                <defs>
                  <linearGradient id="trail" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0" stopColor="#5aa2ff" stopOpacity="0.2" />
                    <stop offset="1" stopColor="#0b63ff" />
                  </linearGradient>
                </defs>
                <path d={PATH} fill="none" stroke="var(--signal)" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 7" strokeLinecap="round" />
                <path ref={trailRef} d={PATH} pathLength={1} fill="none" stroke="url(#trail)" strokeWidth="3.5" strokeLinecap="round" style={{ strokeDasharray: "0 1" }} />
                {[P[0], P[3]].map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r="9" fill="var(--signal)" fillOpacity="0.14" />
                    <circle cx={x} cy={y} r="4" fill="var(--signal)" />
                    <text x={x} y={y + 26} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="11" letterSpacing="1.5">
                      {i ? "LHR" : "JFK"}
                    </text>
                  </g>
                ))}
                <g ref={planeRef} transform={`translate(${start.x.toFixed(1)} ${start.y.toFixed(1)}) rotate(${start.angle.toFixed(1)})`}>
                  <circle r="20" fill="var(--signal)" fillOpacity="0.12" />
                  <path d="M16 0 7 -3 1 -15 -3 -15 0 -3 -9 -4 -12 -9 -15 -9 -13 0 -15 9 -12 9 -9 4 0 3 -3 15 1 15 7 3Z" fill="var(--signal)" />
                </g>
              </svg>

              <dl className="mt-1 grid grid-cols-3 gap-3 border-t border-signal/15 pt-4">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Delay</dt>
                  <dd className="mt-1">
                    <span ref={delayRef} className="font-display text-lg font-bold tabular-nums tracking-tight">
                      {first.delay}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Status</dt>
                  <dd className="mt-1">
                    <span ref={statusRef} data-state={first.status} className="font-display text-lg font-bold tracking-tight data-[state=Delayed]:text-warning data-[state=Eligible]:text-success">
                      {first.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Claim</dt>
                  <dd className="mt-1">
                    <span ref={estRef} style={{ opacity: 0.18 }} className="font-display text-lg font-bold tabular-nums tracking-tight transition-opacity duration-500">
                      £260–£520
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
            <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Scroll to fly</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
