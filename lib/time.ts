import { DateTime } from "luxon";

/** Shared time helpers. Times are stored in UTC and shown in the airport's local zone. */

export function zoneOr(tz: string | null | undefined) {
  return tz && DateTime.local().setZone(tz).isValid ? tz : "UTC";
}

/** Combine a local date (YYYY-MM-DD) and time (HH:mm) at an airport into a UTC Date. */
export function localToUtc(date: string, time: string, tz: string | null | undefined): Date | null {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: zoneOr(tz) });
  return dt.isValid ? dt.toUTC().toJSDate() : null;
}

export function utcToLocalParts(d: Date | string, tz: string | null | undefined) {
  const dt = DateTime.fromJSDate(new Date(d)).setZone(zoneOr(tz));
  return { date: dt.toFormat("yyyy-LL-dd"), time: dt.toFormat("HH:mm") };
}

export function formatLocal(
  d: Date | string | null | undefined,
  tz: string | null | undefined,
  opts: { withZone?: boolean; withDate?: boolean; hour12?: boolean } = {},
) {
  if (!d) return "Not recorded";
  const { withZone = true, withDate = true, hour12 = false } = opts;
  const dt = DateTime.fromJSDate(new Date(d)).setZone(zoneOr(tz));
  const time = dt.toFormat(hour12 ? "h:mm a" : "HH:mm");
  const date = dt.toFormat("ccc d LLL yyyy");
  return `${withDate ? `${date}, ` : ""}${time}${withZone ? ` ${dt.toFormat("ZZZZ")}` : ""}`;
}

export function formatUtc(d: Date | string | null | undefined) {
  if (!d) return "Not recorded";
  return DateTime.fromJSDate(new Date(d)).toUTC().toFormat("yyyy-LL-dd HH:mm 'UTC'");
}

/** 197 -> "3 h 17 min"; negative values are shown as early. */
export function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "Unknown";
  const m = Math.round(Math.abs(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const s = h ? `${h} h ${r} min` : `${r} min`;
  return minutes < 0 ? `${s} early` : s;
}

export function minutesBetween(a: Date | string, b: Date | string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export function relativeTime(d: Date | string) {
  return DateTime.fromJSDate(new Date(d)).toRelative() ?? "";
}

/** Current time in ms. A function so server components can read the clock without tripping render-purity lint rules. */
export function nowMs() {
  return Date.now();
}

export function daysUntil(d: Date | string, now = new Date()) {
  return (new Date(d).getTime() - now.getTime()) / 86_400_000;
}
