"use client";

import { useId, useMemo, useState } from "react";
import { evaluateFlight, type AirportInput, type FlightEligibility } from "@/lib/rules/engine";
import { CAUSES, type CauseKey } from "@/lib/rules/config";
import { Flaps } from "./flaps";
import { cn } from "@/lib/utils";

const LHR: AirportInput = { iata: "LHR", country: "GB", lat: 51.47, lon: -0.4543 };

type Row = {
  flight: string;
  city: string;
  origin: AirportInput;
  airline: string;
  airlineCountry: string;
  scheduled: number; // minutes after midnight, London time
  delay: number;
};

/** Example arrivals into Heathrow. Each one lands under a different rule. */
const ROWS: Row[] = [
  { flight: "BA178", city: "New York JFK", origin: { iata: "JFK", country: "US", lat: 40.6413, lon: -73.7781 }, airline: "British Airways", airlineCountry: "GB", scheduled: 7 * 60 + 5, delay: 219 },
  { flight: "EI154", city: "Dublin", origin: { iata: "DUB", country: "IE", lat: 53.4264, lon: -6.2499 }, airline: "Aer Lingus", airlineCountry: "IE", scheduled: 9 * 60 + 40, delay: 194 },
  { flight: "TP1350", city: "Lisbon", origin: { iata: "LIS", country: "PT", lat: 38.7742, lon: -9.1342 }, airline: "TAP Air Portugal", airlineCountry: "PT", scheduled: 11 * 60 + 15, delay: 0 },
  { flight: "DL30", city: "Atlanta", origin: { iata: "ATL", country: "US", lat: 33.6407, lon: -84.4277 }, airline: "Delta", airlineCountry: "US", scheduled: 12 * 60 + 20, delay: 245 },
  { flight: "IB3166", city: "Madrid", origin: { iata: "MAD", country: "ES", lat: 40.4983, lon: -3.5676 }, airline: "Iberia", airlineCountry: "ES", scheduled: 13 * 60 + 5, delay: 95 },
];

const CAUSE_CHOICES: CauseKey[] = ["unknown", "technical", "crew", "weather", "air_traffic_control"];
const CAUSE_SHORT: Partial<Record<CauseKey, string>> = {
  unknown: "Not told",
  technical: "Technical fault",
  crew: "Crew shortage",
  weather: "Bad weather",
  air_traffic_control: "Air traffic control",
};

const SYMBOL: Record<string, string> = { GBP: "£", EUR: "€", USD: "$" };

function clock(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function lateBy(mins: number) {
  if (mins < 1) return "on time";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h ${m} min late` : `${m} min late`;
}

function money(amount: number | null, currency: string | null) {
  if (amount == null) return "";
  return `${SYMBOL[currency ?? ""] ?? ""}${amount.toLocaleString("en-GB")}`;
}

function evaluate(row: Row, delay: number, cause: CauseKey): FlightEligibility {
  return evaluateFlight({
    origin: row.origin,
    destination: LHR,
    airlineCountry: row.airlineCountry,
    disruption: "delay",
    arrivalDelayMinutes: delay,
    delayEvidenceKind: "gate_arrival",
    cause,
  });
}

function owedCell(e: FlightEligibility) {
  const p = e.primary;
  if (!p || p.status === "not_eligible" || p.kind !== "compensation") return "NONE";
  if (p.status === "needs_review") return "CHECK";
  return money(p.amount, p.currency);
}

export function ArrivalsBoard() {
  const [delays, setDelays] = useState(() => ROWS.map((r) => r.delay));
  const [selected, setSelected] = useState(0);
  const [cause, setCause] = useState<CauseKey>("unknown");
  const sliderId = useId();

  const results = useMemo(() => ROWS.map((r, i) => evaluate(r, delays[i], i === selected ? cause : "unknown")), [delays, selected, cause]);

  const row = ROWS[selected];
  const delay = delays[selected];
  const result = results[selected];
  const primary = result.primary;

  const verdict =
    !primary || primary.status === "not_eligible"
      ? "No compensation"
      : primary.status === "needs_review"
        ? "Needs a closer look"
        : "Likely owed";

  const amount =
    primary && primary.kind === "compensation" && primary.status !== "not_eligible" && primary.amount != null
      ? primary.minAmount != null
        ? `${money(primary.minAmount, primary.currency)} to ${money(primary.amount, primary.currency)}`
        : money(primary.amount, primary.currency)
      : null;

  // The explanation lines that change with the inputs; the first (which rule applies) sits in the header.
  const reasons = primary ? primary.explanation.slice(1, 4) : [result.summary];

  return (
    <div className="overflow-hidden rounded-xl bg-board text-board-ink ring-1 ring-black/20">
      {/* Board */}
      <div className="px-3 pb-4 pt-4 sm:px-6 sm:pt-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-lg font-bold tracking-tight stretch-semi text-board-ink sm:text-xl">
            Arrivals, London Heathrow
          </h2>
          <p className="text-[13px] text-board-ink/60">Example flights. Pick one, then set how late it landed.</p>
        </div>

        <div
          className="grid grid-cols-[auto_auto_1fr_auto] gap-x-1.5 gap-y-1.5 text-[11px] sm:gap-x-4 sm:text-[15px] md:grid-cols-[auto_auto_auto_1fr_auto] lg:text-[18px]"
        >
          <span className="hidden pl-3 text-[11px] font-medium text-board-ink/55 md:block md:text-xs">Due</span>
          <span className="pl-2 text-[11px] font-medium text-board-ink/55 md:pl-0 md:text-xs">Flight</span>
          <span className="text-[11px] font-medium text-board-ink/55 md:text-xs">From</span>
          <span className="text-[11px] font-medium text-board-ink/55 md:text-xs">Status</span>
          <span className="pr-1 text-[11px] font-medium text-board-ink/55 md:text-xs">Owed</span>
            {ROWS.map((r, i) => {
              const d = delays[i];
              const late = d >= 15;
              const owed = owedCell(results[i]);
              const active = i === selected;
              return (
                <button
                  key={r.flight}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "relative col-span-full grid grid-cols-subgrid items-center rounded-md py-1.5 pl-2 pr-1 text-left transition-colors md:pl-3",
                    active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                    "focus-visible:outline-signal",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("absolute inset-y-1 left-0 w-[3px] rounded-full", active ? "bg-signal" : "bg-transparent")}
                  />
                  <Flaps className="hidden md:inline-flex" text={clock(r.scheduled)} length={5} startDelay={i * 3} label={`Due ${clock(r.scheduled)}`} />
                  <Flaps text={r.flight} length={6} startDelay={i * 3} label={`${r.airline} ${r.flight}`} />
                  <span>
                    <Flaps className="md:hidden" text={r.origin.iata} length={3} startDelay={i * 3} label={`from ${r.city}`} />
                    <Flaps className="hidden md:inline-flex" text={r.city} length={12} startDelay={i * 3} label={`from ${r.city}`} />
                  </span>
                  <Flaps
                    className={late ? "text-signal" : undefined}
                    text={late ? `LANDED ${clock(r.scheduled + d)}` : "ON TIME"}
                    length={12}
                    startDelay={i * 3}
                    label={late ? `landed ${clock(r.scheduled + d)}, ${lateBy(d)}` : "on time"}
                  />
                  <Flaps
                    className={owed !== "NONE" ? "text-signal" : "text-board-ink/50"}
                    text={owed}
                    length={5}
                    startDelay={i * 3}
                    label={owed === "NONE" ? "no compensation" : owed === "CHECK" ? "needs review" : `owed ${owed}`}
                  />
                </button>
              );
            })}
        </div>
      </div>

      {/* Controls and the rule behind the number */}
      <div className="grid gap-px bg-border md:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6 bg-card p-5 text-card-foreground sm:p-6">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor={sliderId} className="text-sm font-semibold">
                {row.airline} {row.flight} landed
              </label>
              <output htmlFor={sliderId} className="text-sm tabular-nums text-muted-foreground">
                {lateBy(delay)}
              </output>
            </div>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={480}
              step={1}
              value={delay}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDelays((prev) => prev.map((x, i) => (i === selected ? v : x)));
              }}
              aria-valuetext={lateBy(delay)}
              className="mt-3 h-6 w-full cursor-pointer accent-[var(--primary)]"
            />
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground" aria-hidden>
              <span>0 h</span>
              <span>3 h</span>
              <span>6 h</span>
              <span>8 h</span>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">What the airline said caused it</legend>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CAUSE_CHOICES.map((c) => (
                <label
                  key={c}
                  className={cn(
                    "cursor-pointer rounded-md border px-2.5 py-1.5 text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    cause === c ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  <input type="radio" name="cause" value={c} checked={cause === c} onChange={() => setCause(c)} className="sr-only" />
                  {CAUSE_SHORT[c] ?? CAUSES[c].label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="bg-card p-5 text-card-foreground sm:p-6" aria-live="polite">
          <p className="text-sm text-muted-foreground">{primary ? primary.regimeName : "No rule we check"}</p>
          <p
            className={cn(
              "mt-1 text-3xl font-extrabold tracking-tight stretch-display sm:text-4xl",
              primary?.status === "eligible" && "text-success",
              primary?.status === "needs_review" && "text-warning",
            )}
          >
            {verdict}
            {amount && <span className="text-foreground">: {amount}</span>}
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            {reasons.map((r) => (
              <li key={r} className="max-w-[60ch]">
                {r}
              </li>
            ))}
          </ul>
          {primary && <p className="mt-4 text-xs text-muted-foreground">Rule applied: {primary.ruleApplied}</p>}
        </div>
      </div>
    </div>
  );
}
