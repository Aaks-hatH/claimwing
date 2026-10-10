import { Cpu } from "lucide-react";

export type How = { name: string; line: string; formula?: string };

/** Talking points per step. Short on purpose: the screen shows the idea, the presenter explains it. */
export const RIPPLE_HOW: Record<string, How> = {
  "cascade:Morning check": { name: "Gradient-boosted trees", line: "Base risk from route history and weather. Calibrated and tested on unseen flights.", formula: "P(late) = calibrate(sigmoid(sum of trees))" },
  "cascade:Incoming leaves late": { name: "Delay propagation", line: "A late inbound plane eats the ground time.", formula: "remaining = departure - (inbound arrival + delay)" },
  "cascade:Holding over JFK": { name: "Turnaround range", line: "Needed ground time is a range by aircraft size and airline type. Results are a band of minutes.", formula: "knock-on = max(0, needed - remaining)" },
  "cascade:Passengers report no aircraft": { name: "Report corroboration", line: "Distinct, recent people add support.", formula: "signal = (1 - e^-support) x support / (support + conflict)" },
  "cascade:A conflicting report": { name: "Conflict detection", line: "Claims that cannot both be true weaken each other.", formula: "boarding started vs not started = conflict" },
  "cascade:Delay announced": { name: "Recency decay", line: "Older reports count less.", formula: "weight = 0.5 ^ (age / half-life)" },
  "cascade:Incoming lands": { name: "Observed beats estimated", line: "A recorded time replaces the estimate.", formula: "observed > predicted" },
  "cascade:Boarding": { name: "Source weighting", line: "Official data outweighs passengers.", formula: "provider 1.0, aircraft 0.9, passenger 0.6" },
  "cascade:Your flight departs": { name: "En-route model", line: "The real departure delay is known, so the model sharpens.", formula: "pre-departure model -> en-route model" },
  "cascade:Aircraft swap downstream": { name: "Rotation graph", line: "Link legs only if same registration, airports connect, ground time 15 min to 12 h.", formula: "swap -> old link dropped" },
  "cascade:Arrived": { name: "Recorded outcome", line: "Claims use the recorded arrival, never a forecast.", formula: "eligibility(recorded arrival)" },

  "reports:No reports yet": { name: "Insufficient data", line: "No data, no forecast. It never guesses." },
  "reports:One report": { name: "Unverified", line: "One person is not corroboration.", formula: "support = 0.6 x recency" },
  "reports:Corroborated": { name: "Corroboration", line: "Three independent people. Support adds up.", formula: "support = sum(recency x quality)" },
  "reports:Same person again": { name: "Deduplication", line: "Only each person's latest report counts.", formula: "1 person = 1 vote" },
  "reports:Contradiction": { name: "Conflict", line: "Doors closed and boarding not started cannot both be true.", formula: "signal falls as conflict rises" },
  "reports:Official data resolves it": { name: "Source priority", line: "Provider data outranks passengers.", formula: "provider 1.0 > passenger 0.6" },

  "swap:Late aircraft": { name: "Delay propagation", line: "70 min late against 55 min of ground time.", formula: "knock-on = max(0, needed - remaining)" },
  "swap:Swap announced": { name: "Rotation graph", line: "New registration, new inbound flight. Old link dropped." },
  "swap:Aircraft at the gate": { name: "Reports plus rotation", line: "Passenger report agrees with the new plane. Risk returns to base." },
  "swap:Assignment unclear": { name: "Unknown, not guessed", line: "Your flight missing from the aircraft's legs means unknown.", formula: "no match within 30 min -> unknown" },

  "stale:All sources up": { name: "Freshness tracking", line: "Every source carries a timestamp." },
  "stale:Provider outage": { name: "Graceful degradation", line: "Keep last good data, show its age, lower confidence." },
  "stale:Aircraft data missing": { name: "No unsupported links", line: "No registration, no rotation, no chain.", formula: "no registration -> rotation unknown" },
  "stale:Back online": { name: "Recovery", line: "Fresh data restores confidence." },
};

export const BAG_HOW: How[] = [
  { name: "SHA-256 hash", line: "Original bytes are hashed at capture. Any edit changes the hash.", formula: "sha256(photo)" },
  { name: "Guided capture", line: "Overlay of the first photo. Hand-held shots still differ." },
  { name: "Alignment search", line: "Try shifts of up to 4 px. Keep the lowest error.", formula: "argmin(dx, dy) mean |A - B|" },
  { name: "Difference map", line: "Grayscale, aligned, blurred, scaled 0 to 1.", formula: "d = blur(|A - B|)" },
  { name: "Candidate regions", line: "Bright cells group into regions. A region is a candidate, not damage.", formula: "score = mean difference" },
  { name: "Human in the loop", line: "Runs in your browser. Only regions you confirm are exported." },
];

export const CLAIM_HOW: How[] = [
  { name: "Evidence kinds", line: "Scheduled, estimated, observed. Only observed counts." },
  { name: "Gate arrival", line: "EU and UK measure delay at the gate, not touchdown.", formula: "delay = gate arrival - scheduled arrival" },
  { name: "Readiness checklist", line: "Required and optional items, each with a fix." },
  { name: "Rules engine", line: "Pure function. Same facts, same verdict, with the rule named.", formula: "distance + delay + cause -> verdict" },
  { name: "Uncertainty", line: "Close to a threshold is flagged for review, not guessed.", formula: "threshold +/- margin -> needs review" },
  { name: "Fact-only letter", line: "Unknown facts stay as [PLACEHOLDER]." },
  { name: "SHA-256 manifest", line: "Hash every file. Verify recomputes and catches edits.", formula: "edit letter -> hash mismatch" },
];

/** Algorithms in play for each scenario, shown under the title as a map for the presenter. */
export const ALGOS: Record<string, string[]> = {
  cascade: ["Gradient-boosted trees", "Rotation graph", "Delay propagation", "Report corroboration"],
  reports: ["Corroboration", "Recency decay", "Conflict detection", "Source weighting"],
  swap: ["Rotation graph", "Delay propagation"],
  stale: ["Freshness tracking", "Confidence"],
  bag: ["SHA-256", "Alignment search", "Difference map", "Human review"],
  claim: ["Rules engine", "SHA-256 manifest"],
};

export function HowCard({ how }: { how?: How | null }) {
  if (!how) return null;
  return (
    <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-signal/20 pt-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Cpu className="size-3.5 text-signal" aria-hidden /> {how.name}
      </p>
      <p className="min-w-0 flex-1 basis-60 text-sm text-muted-foreground">{how.line}</p>
      {how.formula && <code className="rounded-lg bg-background/70 px-2.5 py-1 font-mono text-xs">{how.formula}</code>}
    </div>
  );
}
