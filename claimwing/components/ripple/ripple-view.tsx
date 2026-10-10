"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlertTriangle, ChevronDown, Clock3, Database, FlaskConical, GitBranch, History, Info, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { RippleChange, RippleResult } from "@/lib/ripple/engine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { Explain, Term } from "@/components/help/term";
import { cn } from "@/lib/utils";
import { RotationGraph } from "./rotation-graph";
import { DisruptionGuide } from "./disruption-guide";
import { ActivityFeed, MyReports, ReportForm, type MyReport, type SubmitReport } from "./activity";
import { ago, localTime, pct, rangeText, RISK, type AirportInfo } from "./format";

export type RippleViewProps = {
  result: RippleResult;
  changes: RippleChange[];
  previousAt: string | null;
  airports: AirportInfo;
  now: Date;
  mode: "live" | "simulation";
  myReports?: MyReport[];
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Set when the last refresh failed; the view keeps showing the last good result. */
  refreshError?: string | null;
  onSubmitReport?: SubmitReport;
  onDeleteReport?: (id: string) => Promise<void>;
  reportDisabledReason?: React.ReactNode;
  history?: Array<{ computedAt: string; result: RippleResult }>;
  nextActions?: React.ReactNode;
  /** Extra content above everything (demo narration, for example). */
  banner?: React.ReactNode;
  /** Where a selected rotation leg links to (your own trip for that flight, or a demo focus action). */
  legAction?: (key: string) => { href?: string; onClick?: () => void; label: string } | null;
  /** Node key highlighted in the graph (demo spotlight). */
  spotlight?: "overview" | "why" | "rotation" | "ripple" | "reports" | "quality" | null;
};

const KIND_TONE = { ml: "info", fallback: "warning", replay: "neutral", unknown: "neutral" } as const;
const CONF = { good: { label: "Good data", tone: "success" }, limited: { label: "Limited data", tone: "warning" }, poor: { label: "Poor data", tone: "danger" } } as const;
const EFFECT = { raises: { label: "Raises risk", cls: "text-danger" }, lowers: { label: "Lowers risk", cls: "text-success" }, neutral: { label: "Context", cls: "text-muted-foreground" }, unknown: { label: "Unknown effect", cls: "text-muted-foreground" } } as const;
const KIND_LABEL = { observed: "Observed", reported: "Reported by passengers", predicted: "Predicted", context: "Context" } as const;

export function RippleView(props: RippleViewProps) {
  const { result: live, airports, now, mode } = props;
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const viewing = historyIndex !== null && props.history?.[historyIndex] ? props.history[historyIndex].result : live;
  const [selectedLeg, setSelectedLeg] = useState<string | null>(null);
  const r = viewing;
  const otz = airports[r.flight.origin]?.tz;
  const leg = useMemo(() => r.rotation.legs.find((l) => `${l.flightNumber}|${l.date}|${l.origin}` === selectedLeg) ?? null, [r, selectedLeg]);
  const downstreamForLeg = leg ? r.downstream.find((d) => d.leg.flightNumber === leg.flightNumber && d.leg.date === leg.date) : null;
  const spot = (k: NonNullable<RippleViewProps["spotlight"]>) => (props.spotlight === k ? "spotlight" : undefined);

  return (
    <div className="space-y-6">
      {props.banner}

      {/* ------------------------------ Overview ------------------------------ */}
      <section data-spotlight={spot("overview")} className="ripple-section rounded-3xl border bg-card p-5 sm:p-7" aria-labelledby="ripple-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="ripple-title" className="flex items-center gap-2 text-2xl">
              <GitBranch className="size-5 text-signal" aria-hidden /> Flight Ripple
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{r.horizon.label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={KIND_TONE[r.kind]}>
              {r.kind === "ml" ? <Sparkles aria-hidden /> : r.kind === "replay" ? <FlaskConical aria-hidden /> : <Info aria-hidden />}
              {r.kind === "ml" ? "Trained model" : r.kind === "fallback" ? "Rule-based estimate" : r.kind === "replay" ? "Simulation" : "Insufficient data"}
            </Badge>
            <Badge tone={CONF[r.dataQuality.confidence].tone}>{CONF[r.dataQuality.confidence].label}</Badge>
            <DisruptionGuide r={r} mode={mode} />
            {props.onRefresh && (
              <Button size="sm" variant="ghost" onClick={props.onRefresh} disabled={props.refreshing} aria-label="Refresh Flight Ripple">
                {props.refreshing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}
          </div>
        </div>

        {historyIndex !== null && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
            <span className="flex items-center gap-2">
              <History className="size-4" aria-hidden /> Viewing the forecast as it was at {localTime(r.computedAt, otz, true)}. Read-only.
            </span>
            <Button size="sm" variant="outline" onClick={() => setHistoryIndex(null)}>
              Back to latest
            </Button>
          </div>
        )}
        {props.refreshError && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden /> {props.refreshError} Showing the last result from {ago(live.computedAt, now)}.
          </p>
        )}

        <Headline r={r} airports={airports} />

        <div className="mt-6 grid gap-2 sm:grid-cols-3" role="list" aria-label="Delay risk by threshold">
          {r.thresholds.map((t) => {
            const risk = RISK[t.risk];
            const p = r.headline === "model" ? r.probabilities?.find((x) => x.threshold === t.threshold) : undefined;
            const withheld = r.model.withheld?.find((w) => w.threshold === t.threshold);
            return (
              <div role="listitem" key={t.threshold} className="rounded-2xl border bg-background/60 p-3.5">
                <p className="text-xs text-muted-foreground">Arrives {t.threshold}+ min late</p>
                <p className={cn("mt-1 flex items-center gap-1.5 font-semibold", { danger: "text-danger", warning: "text-warning", success: "text-success", neutral: "text-muted-foreground" }[risk.tone])}>
                  <span aria-hidden className="text-[10px]">{risk.icon}</span>
                  {risk.label}
                  {p && <span className="ml-auto text-sm tabular-nums text-foreground">{pct(p.probability)}</span>}
                </p>
                {p && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <motion.div className="h-full rounded-full bg-signal" initial={false} animate={{ width: `${Math.max(2, p.probability * 100)}%` }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} />
                  </div>
                )}
                {withheld && r.headline === "model" && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">Model probability withheld: it didn&apos;t beat a simple baseline in testing.</p>}
              </div>
            );
          })}
        </div>
        {r.probabilities && r.headline !== "model" && r.headline !== "outcome" && (
          <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Historical-pattern model, which doesn&apos;t see the live evidence above:{" "}
            {r.probabilities.map((x) => `${x.threshold}+ min ${pct(x.probability)}`).join(", ")}. The live evidence takes priority.
          </p>
        )}
        {r.probabilities && r.headline === "model" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Percentages are <Term id="probability">probabilities</Term> from ClaimWing&apos;s trained model, shown only because it covers this flight. They describe flights like this one, not a promise about yours.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" aria-hidden /> Updated {ago(r.computedAt, now)}
          </span>
          <span>{r.kindLabel}</span>
        </div>

        {props.history && props.history.length > 1 && (
          <div className="mt-5 border-t pt-4">
            <label htmlFor="ripple-scrub" className="flex items-center justify-between text-xs font-medium">
              <span className="inline-flex items-center gap-1.5">
                <History className="size-3.5" aria-hidden /> Forecast history
              </span>
              <span className="font-normal text-muted-foreground">{historyIndex === null ? "Latest" : localTime(props.history[historyIndex].computedAt, otz, true)}</span>
            </label>
            <input
              id="ripple-scrub"
              type="range"
              min={0}
              max={props.history.length - 1}
              value={historyIndex ?? props.history.length - 1}
              onChange={(e) => {
                const v = Number(e.target.value);
                setHistoryIndex(v === props.history!.length - 1 ? null : v);
              }}
              aria-valuetext={historyIndex === null ? "Latest forecast" : `Forecast from ${localTime(props.history[historyIndex].computedAt, otz, true)}`}
              className="mt-2 w-full accent-[var(--signal)]"
            />
            <p className="text-[11px] text-muted-foreground">Drag to see what ClaimWing knew at each earlier update. Only stored versions are shown.</p>
          </div>
        )}
      </section>

      {props.changes.length > 0 && historyIndex === null && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-signal/30 bg-info-soft/50 p-5" aria-labelledby="ripple-changed">
          <h3 id="ripple-changed" className="flex items-center gap-2 text-lg">
            <Activity className="size-4 text-signal" aria-hidden /> What changed?
          </h3>
          <p className="text-xs text-muted-foreground">Compared with the forecast from {props.previousAt ? ago(props.previousAt, now) : "the previous update"}.</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {props.changes.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                {c.text}
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* ------------------------------ Rotation ------------------------------ */}
      <section data-spotlight={spot("rotation")} className="ripple-section rounded-3xl border bg-card p-5 sm:p-7" aria-labelledby="ripple-rotation">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="ripple-rotation" className="text-xl">
            <Term id="rotation">Aircraft rotation</Term>
          </h3>
          <p className="text-xs text-muted-foreground">
            {r.rotation.registration ? (
              <>
                <Term id="registration">Aircraft</Term> {r.rotation.registration}
                {r.rotation.aircraftModel ? `, ${r.rotation.aircraftModel}` : ""}
                {r.rotation.confidence === "planned" ? " (planned, may change)" : ""}
              </>
            ) : (
              "Aircraft not assigned yet"
            )}
          </p>
        </div>
        <div className="mt-4">
          <RotationGraph rotation={r.rotation} airports={airports} selected={selectedLeg} onSelect={(k) => setSelectedLeg((s) => (s === k ? null : k))} animateKey={r.computedAt} />
        </div>
        <AnimatePresence>
          {leg && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 rounded-2xl border bg-background/60 p-4 text-sm">
                <p className="font-medium">
                  {leg.flightNumber}, {leg.origin} to {leg.destination}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <dt className="text-muted-foreground">Scheduled departure</dt>
                  <dd>{localTime(leg.scheduledDeparture, airports[leg.origin]?.tz, true)}</dd>
                  <dt className="text-muted-foreground">Scheduled arrival</dt>
                  <dd>{localTime(leg.scheduledArrival, airports[leg.destination]?.tz, true)}</dd>
                  <dt className="text-muted-foreground">Estimated arrival</dt>
                  <dd>{leg.estimatedArrival ? localTime(leg.estimatedArrival, airports[leg.destination]?.tz) : "none yet"}</dd>
                  <dt className="text-muted-foreground">Actual arrival</dt>
                  <dd>{leg.actualArrival ? localTime(leg.actualArrival, airports[leg.destination]?.tz) : "not yet"}</dd>
                </dl>
                {downstreamForLeg && <p className="mt-3 text-sm text-muted-foreground">{downstreamForLeg.explanation}</p>}
                {(() => {
                  const a = selectedLeg && props.legAction ? props.legAction(selectedLeg) : null;
                  if (!a) return null;
                  return a.href ? (
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link href={a.href}>{a.label}</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-3" onClick={a.onClick}>
                      {a.label}
                    </Button>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {r.rotation.reasons.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            {r.rotation.reasons.map((x) => (
              <li key={x} className="flex gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {x}
              </li>
            ))}
          </ul>
        )}
        <Explain className="mt-4" label="How does ClaimWing link flights?">
          Flights are linked only when a data provider names the same aircraft registration on both, the earlier one lands where the later one leaves from, and the scheduled gap is between 15 minutes and 12 hours. Matching routes or flight numbers alone never create a link. Times are compared in UTC, so overnight flights and time zones are handled.
        </Explain>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------ Why ------------------------------ */}
          <section data-spotlight={spot("why")} className="ripple-section rounded-3xl border bg-card p-5 sm:p-7" aria-labelledby="ripple-why">
            <h3 id="ripple-why" className="text-xl">Why this prediction?</h3>
            {r.factors.length ? (
              <ul className="mt-4 space-y-2">
                <AnimatePresence initial={false}>
                  {r.factors.map((f) => (
                    <motion.li key={f.id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                      <FactorRow f={f} now={now} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Nothing is affecting the forecast yet. As flight data, the incoming aircraft and passenger reports arrive, they&apos;ll be explained here.</p>
            )}
          </section>

          {/* ------------------------------ Ripple chain ------------------------------ */}
          <section data-spotlight={spot("ripple")} className="ripple-section rounded-3xl border bg-card p-5 sm:p-7" aria-labelledby="ripple-chain">
            <h3 id="ripple-chain" className="text-xl">
              Ripple chain
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              How a delay could pass to the aircraft&apos;s later flights (<Term id="propagation">delay propagation</Term>).
            </p>
            {r.downstream.length ? (
              <ol className="mt-4 space-y-3">
                {r.downstream.map((d) => (
                  <DownstreamRow key={`${d.leg.flightNumber}-${d.leg.date}`} d={d} airports={airports} />
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                {r.rotation.confidence === "unknown" ? "The aircraft's later flights are unknown, so no ripple is shown. ClaimWing doesn't guess which flights share an aircraft." : "No later flights are listed for this aircraft today."}
              </p>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          {/* ------------------------------ Passenger activity ------------------------------ */}
          <section data-spotlight={spot("reports")} className="ripple-section rounded-3xl border bg-card p-5" aria-labelledby="ripple-activity">
            <h3 id="ripple-activity" className="text-xl">
              Passenger activity
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{mode === "simulation" ? "Simulated passengers. Nothing here is real." : "From people following this flight in ClaimWing."}</p>
            <div className="mt-4">
              <ActivityFeed reports={r.reports} now={now} />
            </div>
            {historyIndex === null && props.onSubmitReport && (
              <div className="mt-5 border-t pt-5">
                <ReportForm onSubmit={props.onSubmitReport} disabledReason={props.reportDisabledReason} compact />
              </div>
            )}
            {props.myReports && props.myReports.length > 0 && (
              <div className="mt-5 border-t pt-5">
                <MyReports reports={props.myReports} onDelete={props.onDeleteReport} now={now} />
              </div>
            )}
          </section>

          {props.nextActions}

          {/* ------------------------------ Data quality ------------------------------ */}
          <section data-spotlight={spot("quality")} className="ripple-section rounded-3xl border bg-card p-5" aria-labelledby="ripple-quality">
            <h3 id="ripple-quality" className="flex items-center gap-2 text-xl">
              <Database className="size-4 text-signal" aria-hidden /> <Term id="confidence">Data quality</Term>
            </h3>
            <QualityList title="Conflicts" items={r.dataQuality.conflicts} tone="warning" />
            <QualityList title="Out of date" items={r.dataQuality.stale} tone="warning" />
            <QualityList title="Missing" items={r.dataQuality.missing} tone="neutral" />
            {!r.dataQuality.conflicts.length && !r.dataQuality.stale.length && !r.dataQuality.missing.length && <p className="mt-3 text-sm text-muted-foreground">Nothing missing or out of date.</p>}
            {r.sources.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="text-xs font-medium">Sources</p>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {r.sources.map((s, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="shrink-0">{s.updatedAt ? ago(s.updatedAt, now) : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <ModelCard r={r} />
        </aside>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{r.disclaimer}</p>
    </div>
  );
}

function Headline({ r }: { r: RippleResult; airports: AirportInfo }) {
  let main: React.ReactNode;
  let sub: React.ReactNode = null;
  if (r.headline === "outcome" && r.outcome) {
    main = r.outcome.arrivalDelayMin !== null && r.outcome.arrivalDelayMin >= 1 ? `Arrived ${r.outcome.arrivalDelayMin} min late` : "Arrived on time";
    sub = `Recorded, not predicted. Source: ${r.outcome.source ?? "flight data"}.`;
  } else if (r.horizon.stage === "cancelled") {
    main = "Reported cancelled";
    sub = "Check your rights in the Flight tab and record when you were told.";
  } else if (r.headline === "model" && r.probabilities) {
    const p15 = r.probabilities.find((p) => p.threshold === 15);
    main = p15 ? `${pct(p15.probability)} chance of arriving 15+ min late` : "Model forecast";
    sub = r.expectedArrivalDelay.modelMedian !== null ? `Typical outcome for flights like this: ${r.expectedArrivalDelay.modelMedian <= 0 ? "on time" : `about ${r.expectedArrivalDelay.modelMedian} min late`}.` : null;
  } else if (r.headline === "evidence" && r.expectedArrivalDelay.range) {
    main = `Expected to arrive ${rangeText(r.expectedArrivalDelay.range).replace(" late", "")}${r.expectedArrivalDelay.range.high > 0 ? " late" : ""}`;
    sub = `Based on: ${r.expectedArrivalDelay.basis}.`;
  } else {
    main = "Not enough information yet";
    sub = "Flight Ripple needs live flight data, the aircraft assignment, or passenger reports. What's missing is listed under Data quality.";
  }
  return (
    <div className="mt-6">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={String(main)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="font-display text-3xl leading-tight tracking-tight sm:text-4xl" aria-live="polite">
          {main}
        </motion.p>
      </AnimatePresence>
      {sub && <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">{sub}</p>}
      {r.outcome && r.headline !== "outcome" && r.outcome.departureDelayMin !== null && (
        <p className="mt-2 text-sm">
          Observed: departed {r.outcome.departureDelayMin >= 1 ? `${r.outcome.departureDelayMin} min late` : "on time"}.
        </p>
      )}
    </div>
  );
}

function FactorRow({ f, now }: { f: RippleResult["factors"][number]; now: Date }) {
  const [open, setOpen] = useState(false);
  const e = EFFECT[f.effect];
  return (
    <div className="rounded-2xl border bg-background/60">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-3.5 text-left">
        <span className={cn("w-24 shrink-0 text-xs font-medium", e.cls)}>{e.label}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{f.label}</span>
          <span className="block text-xs text-muted-foreground">
            {KIND_LABEL[f.kind]}
            {f.weight === "major" ? ", major factor" : ""}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t px-3.5 py-3 text-sm">
              <p className="leading-relaxed">{f.detail}</p>
              {f.sources.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {f.sources.map((s, i) => (
                    <li key={i}>
                      Source: {s.label}
                      {s.at ? `, ${ago(s.at, now)}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DownstreamRow({ d, airports }: { d: RippleResult["downstream"][number]; airports: AirportInfo }) {
  const [open, setOpen] = useState(false);
  const worst = d.risks.find((x) => x.risk === "likely") ?? d.risks.find((x) => x.risk === "possible");
  return (
    <li className="rounded-2xl border bg-background/60">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-3.5 text-left">
        <span className="font-mono text-sm font-semibold">{d.leg.flightNumber}</span>
        <span className="text-sm text-muted-foreground">
          {d.leg.origin} to {d.leg.destination}, departs {localTime(d.leg.scheduledDeparture, airports[d.leg.origin]?.tz)}
        </span>
        <span className="ml-auto text-sm">
          {d.arrival ? (
            <>
              <span className="text-muted-foreground">Predicted:</span> {rangeText(d.arrival)}
            </>
          ) : (
            "Not enough data"
          )}
        </span>
        {worst && <Badge tone={worst.risk === "likely" ? "danger" : "warning"}>{RISK[worst.risk].label} {worst.threshold}+ min</Badge>}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ol className="space-y-2 border-t px-3.5 py-3 text-sm">
              {d.chain.map((c, i) => (
                <li key={i} className="flex gap-2 leading-relaxed">
                  <span className="mt-0.5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  {c}
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function QualityList({ title, items, tone }: { title: string; items: string[]; tone: "warning" | "neutral" }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className={cn("text-xs font-medium", tone === "warning" ? "text-warning" : "")}>{title}</p>
      <ul className="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span aria-hidden>•</span>
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

type StageEval = Record<string, { n?: number; brier?: number; baseline_brier?: number; baseline_name?: string; auc?: number | null; ece?: number; calibration?: string; beats_baseline?: boolean; positive_rate?: number } | undefined>;

function ModelCard({ r }: { r: RippleResult }) {
  const [open, setOpen] = useState(false);
  const ev = (r.model.evaluation ?? {}) as StageEval;
  return (
    <section className="rounded-3xl border bg-card p-5" aria-labelledby="ripple-model">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <h3 id="ripple-model" className="flex items-center gap-2 text-xl">
          <Sparkles className="size-4 text-signal" aria-hidden /> About the model
        </h3>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {!r.model.used && <p className="mt-2 text-sm text-muted-foreground">{r.model.unavailableReason ?? "No trained model was used for this result."}</p>}
      {r.model.used && <p className="mt-2 text-sm text-muted-foreground">Version {r.model.version}, {r.model.stage === "enroute" ? "en-route" : "pre-departure"} model.</p>}
      <AnimatePresence initial={false}>
        {open && r.model.used && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-muted-foreground">Trained on {r.model.dataset}. Every number below comes from a later test period the model never saw.</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 font-medium">Late by</th>
                    <th className="pb-1 font-medium">Brier, model</th>
                    <th className="pb-1 font-medium">Brier, baseline</th>
                    <th className="pb-1 font-medium">AUC</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {["15", "60", "180"].map((t) => {
                    const e = ev[t];
                    if (!e) return null;
                    return (
                      <tr key={t} className="border-t">
                        <td className="py-1">{t}+ min</td>
                        <td className={cn(e.beats_baseline ? "text-success" : "text-danger")}>{e.brier}</td>
                        <td>{e.baseline_brier}</td>
                        <td>{e.auc ?? "n/a"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Lower Brier is better. The baseline is the {ev["15"]?.baseline_name ?? "historical rate"}. Pre-departure forecasts are only slightly better than history, because most delays two hours out can&apos;t be predicted from schedules and weather. En-route forecasts are much stronger. <Term id="calibration">Calibration</Term> was checked on held-out data.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
