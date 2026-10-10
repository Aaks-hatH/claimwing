"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrackPoint } from "./flight-map";

export function AltitudeChart({ track, units }: { track: TrackPoint[]; units: "metric" | "imperial" }) {
  const k = units === "metric" ? 1 : 1 / 0.3048;
  const rows = track.map((p) => ({ t: p.t.slice(11, 16), alt: Math.round((p.gnd ? 0 : p.alt ?? 0) * k) }));
  const unit = units === "metric" ? "m" : "ft";
  const max = Math.max(...rows.map((r) => r.alt));
  return (
    <div className="h-44" role="img" aria-label={`Altitude over time, peak ${max.toLocaleString("en")} ${unit}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="alt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            formatter={(v) => [`${Number(v).toLocaleString("en")} ${unit}`, "Altitude"]}
            labelFormatter={(l) => `${l} UTC`}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="alt" stroke="var(--primary)" strokeWidth={2} fill="url(#alt)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
