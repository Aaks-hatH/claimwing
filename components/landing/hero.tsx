"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useIntroDone } from "./intro";
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

/* A fixed scatter of stars (same on server and client). */
const STARS = (() => {
  let s = 7;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 72 }, () => ({ x: (next() * 100).toFixed(2), y: (next() * 100).toFixed(2), r: (0.5 + next() * 1.1).toFixed(2), o: (0.25 + next() * 0.5).toFixed(2) }));
})();

function RiseWord({ children, delay, ready }: { children: React.ReactNode; delay: number; ready: boolean }) {
  return (
    <span className="inline-block overflow-hidden pb-[0.12em] pr-[0.1em] align-bottom">
      <motion.span className="inline-block will-change-transform" initial={{ y: "115%", rotate: 5 }} animate={ready ? { y: 0, rotate: 0 } : { y: "115%", rotate: 5 }} transition={{ duration: 1.05, delay, ease: EASE }}>
        {children}
      </motion.span>
    </span>
  );
}

export function Hero({ startHref }: { startHref: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const ready = useIntroDone();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const titleY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const rings = useTransform(scrollYProgress, [0, 1], [1, 1.7]);
  const starsY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const cardY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  // Flight progress: glides in once the curtain opens, then follows the scroll.
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
    if (reduce || !ready) return;
    const c = animate(intro, START, { duration: 2.2, delay: 0.5, ease: EASE });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, ready]);

  const start = bez(0);
  const first = readout(0);
  const fade = (delay: number, y = 18) => ({
    initial: { opacity: 0, y },
    animate: ready ? { opacity: 1, y: 0 } : { opacity: 0, y },
    transition: { duration: 0.9, delay, ease: EASE },
  });

  return (
    <section ref={ref} className="relative overflow-hidden">
      {/* Night: stars and orbit rings that widen as you leave. */}
      <motion.svg aria-hidden style={{ y: reduce ? 0 : starsY }} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#f2f3f0" opacity={s.o} />
        ))}
      </motion.svg>
      <motion.div aria-hidden style={{ scale: reduce ? 1 : rings }} className="pointer-events-none absolute right-[4%] top-[14%] hidden size-[40rem] rounded-full border border-[rgba(242,243,240,0.14)] lg:block">
        <span className="absolute inset-12 rounded-full border border-[rgba(242,243,240,0.1)]" />
        <span className="absolute inset-28 rounded-full border border-[rgba(242,243,240,0.07)]" />
      </motion.div>

      <div className="relative mx-auto flex min-h-[100svh] max-w-[90rem] flex-col justify-center px-[var(--sw-gutter)] pb-20 pt-28 md:pt-32">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] lg:items-center">
          <motion.div style={reduce ? undefined : { y: titleY, opacity: titleOpacity }}>
            <h1 className="sw-h1">
              <span className="block">
                <RiseWord delay={0.1} ready={ready}>
                  Build
                </RiseWord>{" "}
                <RiseWord delay={0.18} ready={ready}>
                  your
                </RiseWord>
              </span>
              <span className="block">
                <RiseWord delay={0.26} ready={ready}>
                  claim
                </RiseWord>
              </span>
              <span className="block">
                <RiseWord delay={0.4} ready={ready}>
                  in the air.
                </RiseWord>
              </span>
            </h1>

            <motion.p {...fade(0.7)} className="sw-lede mt-8">
              Your flight, tracked. One evidence packet, ready when it lands late.
            </motion.p>

            <motion.div {...fade(0.85)} className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={startHref} className="sw-btn sw-btn-light">
                Start <ArrowUpRight aria-hidden />
              </Link>
              <a href="#board" className="sw-btn sw-btn-outline-light">
                Try it
              </a>
              <Link href="/demo" className="sw-link ml-1 text-[15px]">
                Watch the demo
              </Link>
            </motion.div>
            <motion.p {...fade(1)} className="sw-note mt-5">
              Free. Documentation support, not legal advice.
            </motion.p>
          </motion.div>

          <motion.div style={reduce ? undefined : { y: cardY }} initial={{ opacity: 0, y: 40 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }} transition={{ duration: 1.1, delay: 0.4, ease: EASE }} className="relative">
            <div className="sw-light sw-plate sw-flightcard" aria-label="Flight tracking, animated as you scroll">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em]">
                <strong className="inline-flex items-center gap-2 font-semibold">
                  <span className="live-dot" aria-hidden /> Live
                </strong>
                <span className="text-[var(--sw-slate)]">BA178 · JFK → LHR</span>
              </div>

              <svg viewBox="0 0 400 280" className="mt-2 w-full overflow-visible" aria-hidden>
                <path d={PATH} fill="none" stroke="#5b636b" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="3 7" strokeLinecap="round" />
                <path ref={trailRef} d={PATH} pathLength={1} fill="none" stroke="#1c2024" strokeWidth="3.5" strokeLinecap="butt" style={{ strokeDasharray: "0 1" }} />
                {[P[0], P[3]].map(([x, y], i) => (
                  <g key={i}>
                    <rect x={x - 9} y={y - 9} width="18" height="18" fill="#1c2024" fillOpacity="0.12" />
                    <rect x={x - 4} y={y - 4} width="8" height="8" fill="#1c2024" />
                    <text x={x} y={y + 28} textAnchor="middle" fill="#5b636b" className="font-mono" fontSize="11" letterSpacing="1.5">
                      {i ? "LHR" : "JFK"}
                    </text>
                  </g>
                ))}
                <g ref={planeRef} transform={`translate(${start.x.toFixed(1)} ${start.y.toFixed(1)}) rotate(${start.angle.toFixed(1)})`}>
                  <path d="M16 0 7 -3 1 -15 -3 -15 0 -3 -9 -4 -12 -9 -15 -9 -13 0 -15 9 -12 9 -9 4 0 3 -3 15 1 15 7 3Z" fill="#1c2024" />
                </g>
              </svg>

              <dl className="sw-statrow">
                <div>
                  <dt className="sw-stat-label">Delay</dt>
                  <dd>
                    <span ref={delayRef} className="sw-stat-value">
                      {first.delay}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="sw-stat-label">Status</dt>
                  <dd>
                    <span ref={statusRef} data-state={first.status} className={cn("sw-stat-value", "data-[state=Delayed]:text-warning data-[state=Eligible]:text-success")}>
                      {first.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="sw-stat-label">Claim</dt>
                  <dd>
                    <span ref={estRef} style={{ opacity: 0.18 }} className="sw-stat-value transition-opacity duration-500">
                      £260 to £520
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
            <p className="sw-note mt-4">Scroll to fly the route.</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
