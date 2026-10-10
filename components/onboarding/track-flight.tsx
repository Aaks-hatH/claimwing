"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Plane, Search } from "lucide-react";
import type { RippleResponse } from "@/lib/ripple/service";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { Term } from "@/components/help/term";
import { cn } from "@/lib/utils";

type Existing = { id: string; flightNumber: string; flightDate: string; origin: { iata: string }; destination: { iata: string } };
type Flight = { airline: string; number: string; flightDate: string; origin: string; destination: string; departureTime: string; arrivalDate: string; arrivalTime: string; icao24?: string | null; source?: string | null; found: boolean };

const FLIGHT_RE = /^([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)$/;
const STEPS = ["Find", "Confirm", "Add", "Status"];

/**
 * Guided "track a flight": find it, confirm the dated flight, add it to your trips, then see its
 * first status and forecast. Uses the same lookup and trip APIs as the normal form. Going back keeps
 * everything you entered.
 */
export function TrackFlightWizard({ defaultName, existing, onDone, initialTripId }: { defaultName: string; existing: Existing[]; onDone?: (tripId: string) => void; initialTripId?: string | null }) {
  const [step, setStep] = useState(initialTripId ? 3 : 0);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [flight, setFlight] = useState<Flight | null>(null);
  const [name, setName] = useState(defaultName);
  const [booking, setBooking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(initialTripId ?? null);
  const [ripple, setRipple] = useState<RippleResponse | null>(null);
  const [rippleError, setRippleError] = useState<string | null>(null);

  const parsed = FLIGHT_RE.exec(number.trim().toUpperCase());
  const duplicate = flight ? existing.find((t) => t.flightNumber === `${flight.airline}${flight.number}` && t.flightDate === flight.flightDate) : null;

  useEffect(() => {
    if (step !== 3 || !tripId) return;
    let alive = true;
    fetch(`/api/ripple/${tripId}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "The forecast couldn't load yet.");
        return b as RippleResponse;
      })
      .then((b) => alive && setRipple(b))
      .catch((e) => alive && setRippleError(e instanceof Error ? e.message : "The forecast couldn't load yet."));
    return () => {
      alive = false;
    };
  }, [step, tripId]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!parsed) return setError("Enter a flight number like BA117 or U2 8013.");
    if (!date) return setError("Choose the departure date shown on your booking.");
    setBusy(true);
    try {
      const r = await fetch(`/api/flights/lookup?flight=${encodeURIComponent(parsed[1] + parsed[2])}&date=${date}`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Flight search is unavailable right now.");
      if (b.found) {
        setFlight({ airline: parsed[1], number: parsed[2], flightDate: b.flightDate ?? date, origin: b.origin, destination: b.destination, departureTime: b.departureTime, arrivalDate: b.arrivalDate, arrivalTime: b.arrivalTime, icao24: b.icao24, source: b.source, found: true });
      } else {
        setNotice(b.message ?? "No schedule match. Enter the details from your booking.");
        setFlight({ airline: parsed[1], number: parsed[2], flightDate: date, origin: "", destination: "", departureTime: "", arrivalDate: date, arrivalTime: "", found: false });
      }
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Flight search failed. You can enter the details yourself.");
      setFlight({ airline: parsed[1], number: parsed[2], flightDate: date, origin: "", destination: "", departureTime: "", arrivalDate: date, arrivalTime: "", found: false });
    } finally {
      setBusy(false);
    }
  }

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!flight) return;
    const f = { ...flight, origin: flight.origin.trim().toUpperCase(), destination: flight.destination.trim().toUpperCase() };
    if (!/^[A-Z]{3}$/.test(f.origin) || !/^[A-Z]{3}$/.test(f.destination) || f.origin === f.destination) return setError("Use two different 3-letter airport codes, like JFK and LHR.");
    if (!/^\d{2}:\d{2}$/.test(f.departureTime) || !/^\d{2}:\d{2}$/.test(f.arrivalTime) || !f.arrivalDate) return setError("Enter the scheduled departure and arrival times from your booking.");
    if (!name.trim()) return setError("Enter the passenger name as it appears on the booking.");
    setFlight(f);
    setStep(2);
  }

  async function add() {
    if (!flight || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          airline: flight.airline,
          flightNumber: flight.number,
          flightDate: flight.flightDate,
          origin: flight.origin,
          destination: flight.destination,
          departureTime: flight.departureTime,
          arrivalDate: flight.arrivalDate,
          arrivalTime: flight.arrivalTime,
          passengerName: name.trim(),
          bookingRef: booking.trim() || null,
          ticketPrice: null,
          operatingCarrierRegion: "auto",
          icao24: flight.icao24 ?? "",
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.trip?.id) throw new Error(b.error ?? (b.issues?.[0]?.message as string) ?? "The flight couldn't be added. Check the details and try again.");
      setTripId(b.trip.id);
      setStep(3);
      onDone?.(b.trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The flight couldn't be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ol className="mb-5 flex items-center gap-2 text-xs" aria-label="Track a flight steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span className={cn("grid size-6 place-items-center rounded-full border text-[11px] font-medium transition-colors", i < step ? "border-signal bg-signal text-signal-foreground" : i === step ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}>
              {i < step ? <Check className="size-3" aria-hidden /> : i + 1}
            </span>
            <span className={cn(i === step ? "font-medium" : "text-muted-foreground", "hidden sm:inline")}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px w-5 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }}>
          {step === 0 && (
            <form onSubmit={find} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tf-number">Flight number</Label>
                  <Input id="tf-number" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} placeholder="BA117" autoComplete="off" aria-invalid={Boolean(number) && !parsed} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tf-date">Departure date</Label>
                  <Input id="tf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Local date on your boarding pass.</p>
              {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Find my flight
              </Button>
              {existing.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium">Or pick a flight you already added</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {existing.slice(0, 6).map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => (setTripId(t.id), setStep(3), onDone?.(t.id))} className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted">
                          <span className="font-mono font-medium">{t.flightNumber}</span> {t.origin.iata} to {t.destination.iata}, {t.flightDate}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          )}

          {step === 1 && flight && (
            <form onSubmit={confirm} className="space-y-4" noValidate>
              {flight.found ? (
                <div className="rounded-2xl border bg-background/60 p-4">
                  <p className="text-xs text-muted-foreground">Found{flight.source ? ` in ${flight.source}` : ""}. Check it&apos;s your flight.</p>
                  <p className="mt-2 flex items-center gap-3 font-display text-3xl">
                    {flight.origin} <Plane className="size-5 text-signal" aria-hidden /> {flight.destination}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {flight.airline}
                    {flight.number} on {flight.flightDate}, departs {flight.departureTime}, arrives {flight.arrivalDate !== flight.flightDate ? `${flight.arrivalDate} ` : ""}
                    {flight.arrivalTime} (local times)
                  </p>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border p-4">
                  {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="tf-o" label="From (airport code)" value={flight.origin} onChange={(v) => setFlight({ ...flight, origin: v.toUpperCase().slice(0, 3) })} placeholder="JFK" />
                    <Field id="tf-d" label="To (airport code)" value={flight.destination} onChange={(v) => setFlight({ ...flight, destination: v.toUpperCase().slice(0, 3) })} placeholder="LHR" />
                    <Field id="tf-dt" label="Departs (local)" type="time" value={flight.departureTime} onChange={(v) => setFlight({ ...flight, departureTime: v })} />
                    <Field id="tf-ad" label="Arrival date" type="date" value={flight.arrivalDate} onChange={(v) => setFlight({ ...flight, arrivalDate: v })} />
                    <Field id="tf-at" label="Arrives (local)" type="time" value={flight.arrivalTime} onChange={(v) => setFlight({ ...flight, arrivalTime: v })} />
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="tf-name" label="Passenger name" value={name} onChange={setName} />
                <Field id="tf-book" label="Booking reference (optional)" value={booking} onChange={(v) => setBooking(v.toUpperCase())} />
              </div>
              {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => (setError(null), setStep(0))}>
                  <ArrowLeft aria-hidden /> Back
                </Button>
                <Button type="submit">Continue</Button>
              </div>
            </form>
          )}

          {step === 2 && flight && (
            <div className="space-y-4">
              <p className="text-sm">
                Add <span className="font-mono font-medium">{flight.airline}{flight.number}</span> on {flight.flightDate}, {flight.origin} to {flight.destination}, for {name}?
              </p>
              {duplicate && (
                <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
                  You already added this flight.{" "}
                  <button type="button" className="underline" onClick={() => (setTripId(duplicate.id), setStep(3), onDone?.(duplicate.id))}>
                    Use that trip instead
                  </button>
                  .
                </p>
              )}
              {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={busy}>
                  <ArrowLeft aria-hidden /> Back
                </Button>
                <Button onClick={add} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plane aria-hidden />} {busy ? "Adding" : "Add and start tracking"}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && tripId && (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <Check className="size-4" aria-hidden /> This flight is in your trips.
              </p>
              <div className="rounded-2xl border bg-background/60 p-4" aria-live="polite">
                {!ripple && !rippleError && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Checking its status and forecast
                  </p>
                )}
                {rippleError && <p className="text-sm text-muted-foreground">{rippleError} It will appear on the trip page.</p>}
                {ripple && (
                  <>
                    <p className="text-xs text-muted-foreground">{ripple.result.horizon.label}</p>
                    <p className="mt-1 font-display text-xl">
                      {ripple.result.headline === "none"
                        ? "Not enough information yet"
                        : ripple.result.headline === "model" && ripple.result.probabilities?.[0]
                          ? `${Math.round(ripple.result.probabilities[0].probability * 100)}% chance of arriving 15+ min late`
                          : ripple.result.expectedArrivalDelay.range
                            ? `Expected about ${ripple.result.expectedArrivalDelay.range.mid} min late`
                            : "Tracking has started"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{ripple.result.kindLabel}</p>
                    {ripple.result.dataQuality.missing.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Still to come: {ripple.result.dataQuality.missing.slice(0, 2).join("; ")}. ClaimWing fills these in as the <Term id="rotation">aircraft</Term> and live data appear.
                      </p>
                    )}
                  </>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Useful next steps</p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                  <li>
                    <Link href={`/app/trips/${tripId}?tab=baggage`} className="block rounded-xl border p-3 text-sm hover:bg-muted">Photograph your bag</Link>
                  </li>
                  <li>
                    <Link href={`/app/trips/${tripId}?tab=ripple`} className="block rounded-xl border p-3 text-sm hover:bg-muted">See forecast</Link>
                  </li>
                  <li>
                    <Link href={`/app/trips/${tripId}?tab=flight`} className="block rounded-xl border p-3 text-sm hover:bg-muted">Your rights</Link>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Field({ id, label, value, onChange, type = "text", placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
