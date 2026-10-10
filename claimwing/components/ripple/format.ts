import { DateTime } from "luxon";
import type { MinutesRange } from "@/lib/ripple/propagation";
import type { LegState, RippleResult } from "@/lib/ripple/engine";

export type Risk = RippleResult["thresholds"][number]["risk"];
export type AirportInfo = Record<string, { tz: string; city: string | null; name: string }>;

export const RISK: Record<Risk, { label: string; tone: "danger" | "warning" | "success" | "neutral"; icon: string }> = {
  likely: { label: "Likely", tone: "danger", icon: "▲" },
  possible: { label: "Possible", tone: "warning", icon: "◆" },
  unlikely: { label: "Unlikely", tone: "success", icon: "▼" },
  insufficient: { label: "Not enough data", tone: "neutral", icon: "?" },
};

export const LEG_STATE: Record<LegState | "none", { label: string; className: string }> = {
  observed: { label: "Observed", className: "border-solid border-foreground/70" },
  estimated: { label: "Estimated", className: "border-solid border-signal/70" },
  predicted: { label: "Predicted", className: "border-dashed border-signal/70" },
  scheduled: { label: "Scheduled", className: "border-dotted border-border" },
  unknown: { label: "Insufficient data", className: "border-dotted border-border" },
  none: { label: "No estimate", className: "border-dotted border-border" },
};

export function rangeText(r: MinutesRange | null | undefined, opts: { zeroIsOnTime?: boolean } = {}) {
  if (!r) return "Not enough data";
  if (r.high <= 0 && opts.zeroIsOnTime !== false) return "On time";
  if (r.low === r.high) return `${r.mid} min late`;
  return `${r.low} to ${r.high} min late`;
}

export function localTime(iso: string | null | undefined, tz: string | undefined, withDay = false) {
  if (!iso) return "unknown";
  const dt = DateTime.fromISO(iso).setZone(tz || "UTC");
  return dt.toFormat(withDay ? "ccc d LLL, HH:mm" : "HH:mm");
}

export function ago(iso: string | null | undefined, now: Date) {
  if (!iso) return "unknown time";
  const m = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export function pct(p: number) {
  if (p < 0.01) return "under 1%";
  if (p > 0.99) return "over 99%";
  return `${Math.round(p * 100)}%`;
}
