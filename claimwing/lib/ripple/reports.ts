/**
 * Passenger Network: structured observations and the signal-quality algorithm.
 *
 * A report is an observation, never an official status update. Aggregation is deterministic and
 * explainable. For each kind of observation ("claim") we compute
 *
 *   support   = sum over distinct contributors of  recency_weight x source_quality
 *               (only each contributor's most recent report of that claim counts)
 *   conflict  = support of claims that cannot be true at the same time (e.g. "boarding has not
 *               started" vs "doors closed"), including provider and aircraft observations
 *   signal    = (1 - e^(-support)) x support / (support + conflict)
 *
 * recency_weight  = 0.5 ^ (age / half_life), with a half-life per observation type
 * source_quality  = base by source (provider 1.0, aircraft 0.9, passenger 0.6, simulation 0.6)
 *                   x eligibility (trip added before departure, account not brand new)
 *                   x moderation (flagged reports count 0.3)
 *
 * The score orders and labels observations ("Unverified", "Some corroboration", "Strong
 * corroboration", "Contested"). It is not a probability that the observation is true, and the UI
 * never presents it as a percentage.
 */

export const REPORT_TYPES = [
  "boarding_not_started",
  "boarding_started",
  "gate_changed",
  "delay_announced",
  "doors_closed",
  "departed",
  "deplaning",
  "cancellation_announced",
  "incoming_aircraft_at_gate",
  "incoming_aircraft_not_at_gate",
  "landed",
  "bags_arriving",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_SOURCES = ["passenger", "provider", "aircraft", "simulation"] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export type ModerationState = "accepted" | "flagged" | "rejected";

type TypeInfo = {
  label: string;
  /** Plain-English line shown in the activity feed. */
  sentence: string;
  /** Minutes until a report counts half as much. */
  halfLifeMin: number;
  /** Optional structured value. */
  value?: "gate" | "minutes";
  phase: "before_departure" | "departure" | "after_arrival" | "any";
};

export const REPORT_INFO: Record<ReportType, TypeInfo> = {
  boarding_not_started: { label: "Boarding not started", sentence: "Boarding has not started yet", halfLifeMin: 15, phase: "before_departure" },
  boarding_started: { label: "Boarding started", sentence: "Boarding has started", halfLifeMin: 25, phase: "before_departure" },
  gate_changed: { label: "Gate changed", sentence: "The departure gate changed", halfLifeMin: 45, value: "gate", phase: "before_departure" },
  delay_announced: { label: "Delay announced", sentence: "The airline announced a departure delay", halfLifeMin: 60, value: "minutes", phase: "before_departure" },
  doors_closed: { label: "Doors closed", sentence: "The aircraft doors are closed", halfLifeMin: 30, phase: "departure" },
  departed: { label: "Departed", sentence: "The aircraft has left the gate", halfLifeMin: 90, phase: "departure" },
  deplaning: { label: "Asked to deplane", sentence: "Passengers were asked to leave the aircraft", halfLifeMin: 45, phase: "any" },
  cancellation_announced: { label: "Cancellation announced", sentence: "The airline announced a cancellation", halfLifeMin: 240, phase: "any" },
  incoming_aircraft_at_gate: { label: "Aircraft at the gate", sentence: "The aircraft for this flight is at the gate", halfLifeMin: 40, phase: "before_departure" },
  incoming_aircraft_not_at_gate: { label: "No aircraft at the gate", sentence: "There is no aircraft at the gate yet", halfLifeMin: 20, phase: "before_departure" },
  landed: { label: "Landed", sentence: "The flight has landed", halfLifeMin: 120, phase: "after_arrival" },
  bags_arriving: { label: "Bags arriving", sentence: "Bags are arriving on the belt", halfLifeMin: 40, phase: "after_arrival" },
};

/** Pairs that cannot both be true right now. Symmetric. */
const EXCLUSIVE: Array<[ReportType, ReportType]> = [
  ["boarding_not_started", "boarding_started"],
  ["boarding_not_started", "doors_closed"],
  ["boarding_not_started", "departed"],
  ["boarding_not_started", "landed"],
  ["incoming_aircraft_at_gate", "incoming_aircraft_not_at_gate"],
  ["incoming_aircraft_not_at_gate", "boarding_started"],
  ["incoming_aircraft_not_at_gate", "doors_closed"],
  ["cancellation_announced", "departed"],
  ["cancellation_announced", "doors_closed"],
  ["cancellation_announced", "landed"],
  ["cancellation_announced", "boarding_started"],
  ["deplaning", "departed"],
];
const EXCL = new Map<ReportType, Set<ReportType>>();
for (const [a, b] of EXCLUSIVE) {
  if (!EXCL.has(a)) EXCL.set(a, new Set());
  if (!EXCL.has(b)) EXCL.set(b, new Set());
  EXCL.get(a)!.add(b);
  EXCL.get(b)!.add(a);
}
export function conflictsWith(a: ReportType, b: ReportType) {
  return EXCL.get(a)?.has(b) ?? false;
}

export const SOURCE_QUALITY: Record<ReportSource, number> = { provider: 1, aircraft: 0.9, passenger: 0.6, simulation: 0.6 };

export type ReportInput = {
  id: string;
  type: ReportType;
  source: ReportSource;
  /** Pseudonymous contributor id; per flight, never an account id or email. */
  contributor: string;
  /** Server-side creation time. */
  createdAt: Date;
  /** When the person says they saw it (validated); falls back to createdAt. */
  observedAt?: Date | null;
  moderation: ModerationState;
  /** Contributor eligibility multiplier computed server-side (0..1). */
  eligibility?: number;
  value?: string | number | null;
};

export type ClaimSummary = {
  type: ReportType;
  label: string;
  sentence: string;
  source: "passengers" | "official" | "aircraft" | "simulation" | "mixed";
  contributors: number;
  contributorsLabel: string;
  firstAt: string;
  lastAt: string;
  ageMinutes: number;
  support: number;
  conflict: number;
  signal: number;
  level: "strong" | "some" | "unverified" | "contested" | "faded";
  levelLabel: string;
  conflictsWith: ReportType[];
  /** Most common structured value (gate, or announced minutes), when given. */
  value: string | number | null;
};

export type AggregateResult = {
  computedAt: string;
  totalReports: number;
  distinctContributors: number;
  claims: ClaimSummary[];
  /** Short, plain explanations of anything unusual (bursts, conflicts, rejected reports). */
  notes: string[];
};

const LEVEL_LABEL: Record<ClaimSummary["level"], string> = {
  strong: "Strong corroboration",
  some: "Some corroboration",
  unverified: "Unverified",
  contested: "Contested",
  faded: "Old report",
};

export function recencyWeight(type: ReportType, ageMin: number) {
  if (ageMin <= 0) return 1;
  return Math.pow(0.5, ageMin / REPORT_INFO[type].halfLifeMin);
}

export function contributorsLabel(n: number) {
  if (n <= 1) return "1 report";
  if (n <= 2) return "2 people";
  if (n <= 5) return "3 to 5 people";
  return "6 or more people";
}

function quality(r: ReportInput) {
  const mod = r.moderation === "rejected" ? 0 : r.moderation === "flagged" ? 0.3 : 1;
  return SOURCE_QUALITY[r.source] * (r.eligibility ?? 1) * mod;
}

export function aggregateReports(reports: ReportInput[], now: Date): AggregateResult {
  const usable = reports.filter((r) => r.moderation !== "rejected");
  const notes: string[] = [];
  const rejected = reports.length - usable.length;
  if (rejected) notes.push(`${rejected} report${rejected > 1 ? "s were" : " was"} set aside by automatic checks.`);

  // Most recent report per (claim, contributor).
  const latest = new Map<string, ReportInput>();
  for (const r of usable) {
    const k = `${r.type}|${r.contributor}`;
    const prev = latest.get(k);
    if (!prev || seen(r) > seen(prev)) latest.set(k, r);
  }
  const byType = new Map<ReportType, ReportInput[]>();
  for (const r of latest.values()) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }

  const supportOf = new Map<ReportType, number>();
  for (const [type, list] of byType) {
    supportOf.set(
      type,
      list.reduce((s, r) => s + recencyWeight(type, minutes(now, seen(r))) * quality(r), 0),
    );
  }

  const claims: ClaimSummary[] = [];
  for (const [type, list] of byType) {
    const support = supportOf.get(type) ?? 0;
    const conflictTypes = [...byType.keys()].filter((t) => conflictsWith(type, t));
    // A conflicting claim only counts if it is at least as recent as half this claim's half-life;
    // "boarding not started" an hour ago does not contradict "boarding started" now.
    const lastThis = Math.max(...list.map((r) => seen(r).getTime()));
    const conflict = conflictTypes.reduce((s, t) => {
      const lastOther = Math.max(...byType.get(t)!.map((r) => seen(r).getTime()));
      return lastOther >= lastThis - (REPORT_INFO[type].halfLifeMin / 2) * 60_000 ? s + (supportOf.get(t) ?? 0) : s;
    }, 0);
    const signal = support <= 0 ? 0 : (1 - Math.exp(-support)) * (support / (support + conflict));
    const first = Math.min(...list.map((r) => seen(r).getTime()));
    const ageMin = minutes(now, new Date(lastThis));
    const contributors = new Set(list.map((r) => r.contributor)).size;
    const sources = new Set(list.map((r) => r.source));
    const source: ClaimSummary["source"] =
      sources.size > 1 ? "mixed" : sources.has("provider") ? "official" : sources.has("aircraft") ? "aircraft" : sources.has("simulation") ? "simulation" : "passengers";
    const official = sources.has("provider") || sources.has("aircraft");
    let level: ClaimSummary["level"];
    if (conflict > 0 && conflict / (support + conflict) > 0.35) level = "contested";
    else if (ageMin > REPORT_INFO[type].halfLifeMin * 3) level = "faded";
    else if (signal >= 0.55 && (contributors >= 2 || official)) level = "strong";
    else if (signal >= 0.3 && (contributors >= 2 || official)) level = "some";
    else level = "unverified";
    claims.push({
      type,
      label: REPORT_INFO[type].label,
      sentence: REPORT_INFO[type].sentence,
      source,
      contributors,
      contributorsLabel: official && contributors === 1 ? "Official or aircraft data" : contributorsLabel(contributors),
      firstAt: new Date(first).toISOString(),
      lastAt: new Date(lastThis).toISOString(),
      ageMinutes: Math.round(ageMin),
      support: round(support),
      conflict: round(conflict),
      signal: round(signal),
      level,
      levelLabel: LEVEL_LABEL[level],
      conflictsWith: conflictTypes,
      value: modeValue(list),
    });
  }
  claims.sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  if (claims.some((c) => c.level === "contested")) notes.push("Some observations disagree. They are shown, marked as contested, and weigh less in the forecast.");
  const burst = detectBurst(usable);
  if (burst) notes.push(burst);

  return {
    computedAt: now.toISOString(),
    totalReports: usable.length,
    distinctContributors: new Set(usable.filter((r) => r.source === "passenger" || r.source === "simulation").map((r) => r.contributor)).size,
    claims,
    notes,
  };
}

/**
 * Bursts: many reports in a very short window. Used server-side to flag new reports and here to
 * explain the feed. Returns a note, or null.
 */
export function detectBurst(reports: ReportInput[], windowMin = 2, max = 12): string | null {
  const times = reports.filter((r) => r.source === "passenger").map((r) => r.createdAt.getTime()).sort((a, b) => a - b);
  for (let i = 0, j = 0; j < times.length; j++) {
    while (times[j] - times[i] > windowMin * 60_000) i++;
    if (j - i + 1 > max) return "An unusual burst of reports arrived within two minutes. Those reports are flagged and weigh less.";
  }
  return null;
}

/* --------------------------------- validation --------------------------------- */

export type ReportValidation =
  | { ok: true; observedAt: Date | null; value: string | number | null; note: string | null }
  | { ok: false; code: "invalid_time" | "invalid_value" | "outside_window"; message: string };

/**
 * Server-side checks for a new report. `window` is the period during which reports about this
 * dated flight make sense (from 6 hours before scheduled departure to 12 hours after arrival).
 */
export function validateReport(
  input: { type: ReportType; observedAt?: string | null; value?: string | number | null; note?: string | null },
  ctx: { now: Date; scheduledDeparture: Date; scheduledArrival: Date },
): ReportValidation {
  const opens = ctx.scheduledDeparture.getTime() - 6 * 3600_000;
  const closes = ctx.scheduledArrival.getTime() + 12 * 3600_000;
  if (ctx.now.getTime() < opens || ctx.now.getTime() > closes) {
    return { ok: false, code: "outside_window", message: "Reports open 6 hours before departure and close 12 hours after arrival." };
  }
  let observedAt: Date | null = null;
  if (input.observedAt) {
    const t = new Date(input.observedAt);
    if (Number.isNaN(t.getTime())) return { ok: false, code: "invalid_time", message: "The time you saw this isn't a valid time." };
    if (t.getTime() > ctx.now.getTime() + 2 * 60_000) return { ok: false, code: "invalid_time", message: "The time you saw this is in the future." };
    if (t.getTime() < ctx.now.getTime() - 3 * 3600_000 || t.getTime() < opens) {
      return { ok: false, code: "invalid_time", message: "Reports must be about something you saw in the last 3 hours." };
    }
    observedAt = t;
  }
  let value: string | number | null = null;
  const kind = REPORT_INFO[input.type].value;
  if (input.value !== undefined && input.value !== null && input.value !== "") {
    if (kind === "gate") {
      const g = String(input.value).trim().toUpperCase();
      if (!/^[A-Z]?\d{1,3}[A-Z]?$/.test(g)) return { ok: false, code: "invalid_value", message: "Enter a gate like B32 or 7." };
      value = g;
    } else if (kind === "minutes") {
      const m = Number(input.value);
      if (!Number.isInteger(m) || m < 5 || m > 1440) return { ok: false, code: "invalid_value", message: "Enter the announced delay in minutes, between 5 and 1440." };
      value = m;
    } else {
      return { ok: false, code: "invalid_value", message: "This kind of report doesn't take a value." };
    }
  }
  return { ok: true, observedAt, value, note: sanitizeNote(input.note) };
}

/**
 * Notes are optional, short and plain text. Anything that looks like contact details or a booking
 * reference is removed, because notes are about the flight, not about people.
 */
export function sanitizeNote(note: string | null | undefined): string | null {
  if (!note) return null;
  let s = note.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[removed]");
  s = s.replace(/\+?\d[\d\s().-]{7,}\d/g, "[removed]");
  s = s.replace(/\b(?=[A-Z0-9]{6}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6}\b/g, "[removed]");
  s = s.slice(0, 140);
  return s || null;
}

/* --------------------------------- helpers --------------------------------- */

function seen(r: ReportInput) {
  return r.observedAt ?? r.createdAt;
}
function minutes(now: Date, t: Date) {
  return Math.max(0, (now.getTime() - t.getTime()) / 60_000);
}
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
function modeValue(list: ReportInput[]) {
  const counts = new Map<string, { v: string | number; n: number }>();
  for (const r of list) {
    if (r.value === undefined || r.value === null) continue;
    const k = String(r.value);
    counts.set(k, { v: r.value, n: (counts.get(k)?.n ?? 0) + 1 });
  }
  let best: { v: string | number; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.v ?? null;
}
