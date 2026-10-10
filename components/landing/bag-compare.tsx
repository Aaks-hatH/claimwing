"use client";

import { useId, useState } from "react";

const SHELL = "#3f5263";
const SHELL_HI = "#5a6f82";

function Suitcase({ damaged, sheen }: { damaged?: boolean; sheen: string }) {
  return (
    <g>
      {/* telescopic handle */}
      <rect x="180" y="6" width="40" height="8" rx="3" fill="#2a3540" />
      <rect x="184" y="12" width="5" height="30" fill="#7d8a96" />
      <rect x="211" y="12" width="5" height="30" fill="#7d8a96" />
      {/* shell */}
      <rect x="128" y="40" width="144" height="204" rx="16" fill={SHELL} />
      <rect x="128" y="40" width="144" height="204" rx="16" fill={`url(#${sheen})`} />
      {[164, 200, 236].map((x) => (
        <rect key={x} x={x - 3} y="54" width="6" height="176" rx="3" fill={SHELL_HI} opacity="0.55" />
      ))}
      <rect x="128" y="132" width="144" height="5" fill="#2f3e4b" />
      {/* bag tag, hanging off the left so it doesn't hide the damage */}
      <path d="M150 62 q-10 -8 -14 6" stroke="#cfd5db" strokeWidth="2" fill="none" />
      <g transform="rotate(-8 131 86)">
        <rect x="120" y="66" width="22" height="40" rx="3" fill="#f4f6f8" />
        <rect x="124" y="74" width="14" height="3" fill="#9aa4ae" />
        <rect x="124" y="80" width="10" height="3" fill="#9aa4ae" />
      </g>
      {/* wheels */}
      <rect x="138" y="242" width="20" height="10" rx="3" fill="#2a3540" />
      <circle cx="148" cy="258" r="9" fill="#1c2329" />
      {damaged ? (
        <>
          {/* snapped wheel housing: wheel lying on the belt */}
          <rect x="242" y="242" width="20" height="5" rx="2" fill="#2a3540" />
          <path d="M244 247 l4 5 l4 -4 l4 5 l4 -5" stroke="#2a3540" strokeWidth="2" fill="none" />
          <circle cx="300" cy="266" r="9" fill="#1c2329" />
          <rect x="292" y="252" width="16" height="7" rx="2" fill="#2a3540" transform="rotate(24 300 255)" />
        </>
      ) : (
        <>
          <rect x="242" y="242" width="20" height="10" rx="3" fill="#2a3540" />
          <circle cx="252" cy="258" r="9" fill="#1c2329" />
        </>
      )}
      {damaged && (
        <>
          {/* cracked corner */}
          <path d="M268 50 l-12 14 l7 6 l-15 16 l6 5 l-13 15" stroke="#e9edf1" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
          <path d="M256 64 l-10 -3 M248 86 l-9 2" stroke="#e9edf1" strokeWidth="1.4" fill="none" />
          {/* dent */}
          <ellipse cx="170" cy="186" rx="22" ry="16" fill="#25313c" opacity="0.6" />
          <ellipse cx="174" cy="182" rx="12" ry="8" fill="#6b8193" opacity="0.5" />
          {/* scuffs */}
          <path d="M150 210 l26 -6 M156 220 l30 -7 M214 160 l22 -3" stroke="#c6ced6" strokeWidth="1.5" opacity="0.7" />
        </>
      )}
    </g>
  );
}

function Marker({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="11" fill="var(--signal)" stroke="#1e252d" strokeWidth="2" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#1e252d">
        {n}
      </text>
    </g>
  );
}

function Scene({ damaged }: { damaged?: boolean }) {
  const sheen = damaged ? "cw-sheen-after" : "cw-sheen-before";
  return (
    <svg viewBox="0 0 400 300" className="block h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={sheen} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {damaged ? (
        <>
          {/* baggage carousel: rubber slats under warm hall light */}
          <rect width="400" height="300" fill="#b7bec6" />
          <rect y="236" width="400" height="64" fill="#2b3138" />
          {Array.from({ length: 11 }, (_, i) => (
            <rect key={i} x={i * 40 - 6} y="236" width="3" height="64" fill="#3c444d" />
          ))}
          <rect y="232" width="400" height="5" fill="#8e979f" />
        </>
      ) : (
        <>
          {/* check-in floor */}
          <rect width="400" height="300" fill="#dfe3e7" />
          <rect y="262" width="400" height="38" fill="#cbd1d7" />
        </>
      )}
      <ellipse cx="200" cy="268" rx="96" ry="8" fill="#000" opacity="0.18" />
      <Suitcase damaged={damaged} sheen={sheen} />
      {damaged && (
        <>
          <Marker x={286} y={44} n={1} />
          <Marker x={322} y={240} n={2} />
          <Marker x={140} y={168} n={3} />
        </>
      )}
    </svg>
  );
}

export function BagCompare() {
  const [pos, setPos] = useState(50);
  const id = useId();
  return (
    <figure>
      <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl bg-muted ring-1 ring-border has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-ring">
        <div className="absolute inset-0">
          <Scene />
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <Scene damaged />
        </div>
        <span className="absolute left-3 top-3 rounded bg-white/85 px-2 py-1 text-xs font-semibold text-[#1e252d]">
          Check-in, 06:12
        </span>
        <span className="absolute right-3 top-3 rounded bg-[#1e252d]/85 px-2 py-1 text-xs font-semibold text-white">
          Baggage hall, 17:48
        </span>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-signal" style={{ left: `${pos}%` }} aria-hidden>
          <span className="absolute top-1/2 left-1/2 flex h-9 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[3px] rounded bg-signal shadow-[0_1px_2px_rgb(0_0_0/0.25)]">
            <span className="h-4 w-px bg-[#1e252d]" />
            <span className="h-4 w-px bg-[#1e252d]" />
          </span>
        </div>
        <label htmlFor={id} className="sr-only">
          Compare the check-in photo with the baggage hall photo
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-valuetext={`${pos}% check-in photo`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="mt-4 grid gap-x-6 gap-y-2 text-sm text-muted-foreground sm:grid-cols-3">
        <span>
          <b className="font-semibold text-foreground">1</b> Shell cracked at the top corner
        </span>
        <span>
          <b className="font-semibold text-foreground">2</b> Rear wheel housing snapped off
        </span>
        <span>
          <b className="font-semibold text-foreground">3</b> Dent and scuffs on the front panel
        </span>
      </figcaption>
    </figure>
  );
}
