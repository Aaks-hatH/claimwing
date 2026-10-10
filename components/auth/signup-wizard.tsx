"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowLeft, ArrowRight, Check, Clock3, Eye, EyeOff, LoaderCircle, LockKeyhole, MapPin, Plane, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";

type LookupBody = {
  found?: boolean;
  configured?: boolean;
  message?: string;
  source?: string;
  origin?: string;
  destination?: string;
  departureTime?: string;
  flightDate?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  icao24?: string | null;
};

type Flight = {
  airline: string;
  number: string;
  flightDate: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  icao24?: string | null;
  source?: string;
  lookupFound: boolean;
};

type Stage = "flight" | "passenger" | "account" | "saving" | "recovery";
type Notice = { tone: "success" | "warning" | "info"; message: string } | null;

function parseFlightNumber(raw: string) {
  const match = raw.replace(/\s+/g, "").toUpperCase().match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
  return match ? { airline: match[1], number: match[2].replace(/^0+(?=\d)/, "") } : null;
}

function todayLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function SignupWizard({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("flight");
  const [flightNumber, setFlightNumber] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [flight, setFlight] = useState<Flight | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ origin: "", destination: "", departureTime: "", arrivalDate: "", arrivalTime: "" });
  const [passengerName, setPassengerName] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);

  const activeStep = stage === "flight" ? 0 : stage === "passenger" ? 1 : 2;
  const parsed = parseFlightNumber(flightNumber);

  async function findFlight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!parsed) {
      setError("Enter a flight number such as BA117 or 3U8888.");
      return;
    }
    if (!flightDate) {
      setError("Choose the date your flight departs.");
      return;
    }
    setLookupBusy(true);
    try {
      const fullNumber = `${parsed.airline}${parsed.number}`;
      const response = await fetch(`/api/flights/lookup?flight=${encodeURIComponent(fullNumber)}&date=${encodeURIComponent(flightDate)}`);
      const body = (await response.json().catch(() => ({}))) as LookupBody & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Flight search is temporarily unavailable. Try entering the details yourself.");
      if (!body.found || !body.origin || !body.destination || !body.departureTime || !body.arrivalDate || !body.arrivalTime) {
        setNotice({ tone: body.configured ? "warning" : "info", message: body.message ?? "No schedule match yet. You can still add the flight details manually." });
        setManualOpen(true);
        return;
      }
      setFlight({
        airline: parsed.airline,
        number: parsed.number,
        flightDate: body.flightDate ?? flightDate,
        origin: body.origin,
        destination: body.destination,
        departureTime: body.departureTime,
        arrivalDate: body.arrivalDate,
        arrivalTime: body.arrivalTime,
        icao24: body.icao24,
        source: body.source,
        lookupFound: true,
      });
      setManualOpen(false);
      setNotice({ tone: "success", message: `Flight found${body.source ? ` · ${body.source}` : ""}. Check the route before continuing.` });
    } catch (cause) {
      setNotice({ tone: "warning", message: cause instanceof Error ? cause.message : "Flight search failed. Enter the details yourself." });
      setManualOpen(true);
    } finally {
      setLookupBusy(false);
    }
  }

  function useManualFlight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!parsed) {
      setError("Enter a valid flight number first, such as BA117.");
      return;
    }
    if (!flightDate) {
      setError("Choose the departure date first.");
      return;
    }
    const origin = manual.origin.trim().toUpperCase();
    const destination = manual.destination.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) {
      setError("Use different 3-letter airport codes for From and To (for example, JFK and LHR).");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(manual.departureTime) || !manual.arrivalDate || !/^\d{2}:\d{2}$/.test(manual.arrivalTime)) {
      setError("Enter the scheduled departure and arrival dates and times from your booking.");
      return;
    }
    setFlight({ airline: parsed.airline, number: parsed.number, flightDate, origin, destination, departureTime: manual.departureTime, arrivalDate: manual.arrivalDate, arrivalTime: manual.arrivalTime, lookupFound: false });
    setNotice({ tone: "success", message: "Flight details saved. We’ll still track the flight when the trip is added." });
    setManualOpen(false);
  }

  async function saveFlight() {
    if (!flight) return;
    setStage("saving");
    setError(null);
    try {
      const response = await fetch("/api/trips", {
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
          passengerName: passengerName.trim(),
          bookingRef: bookingRef.trim() || null,
          ticketPrice: null,
          operatingCarrierRegion: "auto",
          icao24: flight.icao24 ?? "",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { trip?: { id?: string }; error?: string };
      if (!response.ok || !body.trip?.id) throw new Error(body.error ?? "Your account is ready, but we couldn’t save this flight yet.");
      // New accounts get the (skippable) welcome tour once, starting from the flight they just added.
      const destination = callbackUrl === "/app" ? `/app/welcome?trip=${body.trip.id}` : callbackUrl;
      router.push(destination);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your account is ready, but we couldn’t save this flight yet.");
      setStage("recovery");
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!flight) {
      setStage("flight");
      setError("Add your flight details first.");
      return;
    }
    if (!passengerName.trim()) {
      setStage("passenger");
      setError("Enter the passenger name as it appears on the ticket.");
      return;
    }
    if (!name.trim()) return setError("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return setError("Use at least 10 characters, with at least one letter and one number.");
    }
    if (!accepted) return setError("Please accept the terms and privacy notice to continue.");

    setStage("saving");
    let accountCreated = false;
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Couldn’t create your account. Please try again.");
      accountCreated = true;
      setAccountExists(true);
      const login = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (login?.error) {
        setLoginRequired(true);
        setError("Your account is ready. Sign in, then add this flight from your dashboard.");
        setStage("recovery");
        return;
      }
      await saveFlight();
    } catch (cause) {
      if (accountCreated) {
        setLoginRequired(true);
        setError("Your account is ready, but sign-in didn’t finish. Sign in, then add this flight from your dashboard.");
        setStage("recovery");
      } else {
        setError(cause instanceof Error ? cause.message : "Couldn’t create your account. Please try again.");
        setStage("account");
      }
    }
  }

  const stageTitle = stage === "flight" ? "Start with your flight." : stage === "passenger" ? "Who was travelling?" : stage === "account" ? "Make your evidence yours." : stage === "saving" ? "Setting up your flight…" : "Your flight is almost there.";

  return (
    <section className="onboarding-card" aria-labelledby="signup-title">
      <div className="onboarding-topline">
        <span className="onboarding-kicker"><Sparkles size={14} aria-hidden /> YOUR FLIGHT, FIRST</span>
        <span className="onboarding-free"><span aria-hidden /> Free · no cut of any claim</span>
      </div>

      <div className="onboarding-heading">
        <h2 id="signup-title">{stageTitle}</h2>
        <p>{stage === "flight" ? "Find your flight first." : stage === "passenger" ? "We’ll attach the evidence to the right passenger and booking." : stage === "account" ? "A private account keeps the flight timeline and evidence together." : stage === "saving" ? "Creating your private space and adding the trip you just found." : "Your account has been created; we’re helping the flight catch up."}</p>
      </div>

      {stage !== "saving" && stage !== "recovery" && (
        <ol className="onboarding-steps" aria-label="Signup progress">
          {["Flight", "Passenger", "Account"].map((label, index) => (
            <li key={label} className={index < activeStep ? "is-complete" : index === activeStep ? "is-current" : ""} aria-current={index === activeStep ? "step" : undefined}>
              <span className="onboarding-step-dot">{index < activeStep ? <Check size={13} aria-hidden /> : `0${index + 1}`}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      )}

      {error && <div className="onboarding-error" role="alert">{error}</div>}
      {notice && stage === "flight" && <Alert className="onboarding-notice" tone={notice.tone} title={notice.message} />}

      {stage === "flight" && (
        <div key="flight" className="wizard-panel">
          <form onSubmit={findFlight} className="wizard-form">
            <div className="wizard-field-grid">
              <div className="space-y-2">
                <Label htmlFor="signup-flight">Flight number</Label>
                <div className="wizard-flight-input"><Plane size={17} aria-hidden /><Input id="signup-flight" value={flightNumber} onChange={(event) => { setFlightNumber(event.target.value.toUpperCase()); setFlight(null); }} placeholder="BA117" autoCapitalize="characters" autoComplete="off" /></div>
                <p className="wizard-helper">Airline code plus number, like BA117 or DL30.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-flight-date">Departure date</Label>
                <Input id="signup-flight-date" type="date" value={flightDate} onChange={(event) => { setFlightDate(event.target.value); setFlight(null); }} onFocus={(event) => { if (!event.currentTarget.value) setFlightDate(todayLocal()); }} />
                <p className="wizard-helper">The local date shown on your booking.</p>
              </div>
            </div>
            <Button type="submit" variant="signal" size="lg" className="wizard-primary" loading={lookupBusy}>
              {!lookupBusy && <Search size={17} aria-hidden />} Find my flight <ArrowRight size={17} aria-hidden />
            </Button>
          </form>

          {flight && (
            <div className="flight-found-card" aria-live="polite">
              <div className="flight-found-top"><span className="flight-found-status"><span aria-hidden /> {flight.lookupFound ? "FLIGHT FOUND" : "DETAILS READY"}</span><span className="flight-found-date">{flight.flightDate}</span></div>
              <div className="flight-route">
                <div><span className="flight-route-code">{flight.origin}</span><span className="flight-route-time">{flight.departureTime} departure</span></div>
                <div className="flight-route-line"><Plane size={15} aria-hidden /></div>
                <div className="text-right"><span className="flight-route-code">{flight.destination}</span><span className="flight-route-time">{flight.arrivalTime} arrival</span></div>
              </div>
              <div className="flight-found-bottom"><span>{flight.airline}{flight.number}</span><span>{flight.source ? `Schedule · ${flight.source}` : flight.lookupFound ? "Schedule confirmed" : "Your booking"}</span></div>
              <Button type="button" onClick={() => { setError(null); setStage("passenger"); }} className="wizard-primary" size="lg">That’s my flight <ArrowRight size={17} aria-hidden /></Button>
            </div>
          )}

          <div className="wizard-manual-toggle">
            <span>Can’t find it?</span>
            <button type="button" onClick={() => setManualOpen((open) => !open)}>{manualOpen ? "Hide manual entry" : "Enter details manually"}</button>
          </div>
          {manualOpen && (
            <form className="wizard-manual-form" onSubmit={useManualFlight}>
              <div className="wizard-manual-heading"><MapPin size={16} aria-hidden /><span>Use the schedule in your booking</span></div>
              <div className="wizard-field-grid wizard-field-grid-four">
                <div className="space-y-2"><Label htmlFor="manual-origin">From</Label><Input id="manual-origin" maxLength={3} value={manual.origin} onChange={(e) => setManual({ ...manual, origin: e.target.value.toUpperCase() })} placeholder="JFK" /></div>
                <div className="space-y-2"><Label htmlFor="manual-destination">To</Label><Input id="manual-destination" maxLength={3} value={manual.destination} onChange={(e) => setManual({ ...manual, destination: e.target.value.toUpperCase() })} placeholder="LHR" /></div>
                <div className="space-y-2"><Label htmlFor="manual-departure-time">Departure</Label><Input id="manual-departure-time" type="time" value={manual.departureTime} onChange={(e) => setManual({ ...manual, departureTime: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="manual-arrival-date">Arrival date</Label><Input id="manual-arrival-date" type="date" value={manual.arrivalDate || flightDate} onChange={(e) => setManual({ ...manual, arrivalDate: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="manual-arrival-time">Arrival time</Label><Input id="manual-arrival-time" type="time" value={manual.arrivalTime} onChange={(e) => setManual({ ...manual, arrivalTime: e.target.value })} /></div>
              </div>
              <Button type="submit" variant="outline" className="w-full">Use these flight details <ArrowRight size={16} aria-hidden /></Button>
              <p className="wizard-helper">Local times.</p>
            </form>
          )}
          <p className="wizard-private-note"><ShieldCheck size={15} aria-hidden /> Your flight details stay private to your account.</p>
        </div>
      )}

      {stage === "passenger" && flight && (
        <form key="passenger" className="wizard-panel wizard-form" onSubmit={(event) => { event.preventDefault(); setError(null); if (!passengerName.trim()) { setError("Enter the passenger name as it appears on the ticket."); return; } setStage("account"); }}>
          <div className="flight-summary-strip"><Plane size={17} aria-hidden /><strong>{flight.airline}{flight.number}</strong><span>{flight.origin}</span><span className="flight-summary-arrow">→</span><span>{flight.destination}</span><span className="flight-summary-date">{flight.flightDate}</span></div>
          <div className="space-y-2"><Label htmlFor="passenger-name">Passenger name</Label><Input id="passenger-name" autoComplete="name" value={passengerName} onChange={(event) => setPassengerName(event.target.value)} placeholder="As it appears on your ticket" required /><p className="wizard-helper">This connects the evidence to the right traveller.</p></div>
          <div className="space-y-2"><Label htmlFor="booking-reference">Booking reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="booking-reference" value={bookingRef} onChange={(event) => setBookingRef(event.target.value.toUpperCase())} placeholder="ABC123" autoCapitalize="characters" maxLength={20} /><p className="wizard-helper">You can add it later, too.</p></div>
          <Button type="submit" variant="signal" size="lg" className="wizard-primary">Continue to your account <ArrowRight size={17} aria-hidden /></Button>
          <button type="button" className="wizard-back" onClick={() => { setError(null); setStage("flight"); }}><ArrowLeft size={15} aria-hidden /> Back to flight</button>
        </form>
      )}

      {stage === "account" && (
        <form key="account" className="wizard-panel wizard-form" onSubmit={createAccount}>
          <div className="flight-summary-strip"><Plane size={17} aria-hidden /><strong>{flight?.airline}{flight?.number}</strong><span>{flight?.origin}</span><span className="flight-summary-arrow">→</span><span>{flight?.destination}</span><span className="flight-summary-date">{flight?.flightDate}</span></div>
          <div className="wizard-field-grid">
            <div className="space-y-2"><Label htmlFor="signup-name">Your name</Label><Input id="signup-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required /></div>
            <div className="space-y-2"><Label htmlFor="signup-email">Email address</Label><Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="signup-password">Password</Label><div className="wizard-password"><Input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /><button type="button" className="wizard-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><p className="wizard-helper">At least 10 characters, with a letter and a number.</p></div>
          <label className="wizard-terms"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>I agree to the <Link href="/terms" className="underline underline-offset-4">terms</Link> and <Link href="/privacy" className="underline underline-offset-4">privacy notice</Link>, and understand ClaimWing is not legal advice.</span></label>
          <Button type="submit" variant="signal" size="lg" className="wizard-primary"><LockKeyhole size={16} aria-hidden /> Create account & add flight <ArrowRight size={17} aria-hidden /></Button>
          <button type="button" className="wizard-back" onClick={() => { setError(null); setStage("passenger"); }}><ArrowLeft size={15} aria-hidden /> Back to passenger</button>
          <p className="wizard-existing">Already have an account? <Link href="/login">Sign in instead</Link></p>
        </form>
      )}

      {stage === "saving" && (
        <div className="wizard-panel wizard-status-panel" role="status" aria-live="polite">
          <span className="wizard-status-icon"><LoaderCircle size={28} className="animate-spin" aria-hidden /></span>
          <p className="wizard-status-title">{accountExists ? "Adding your flight" : "Preparing your account"}</p>
          <p className="wizard-helper">{accountExists ? "Setting up live tracking and your trip timeline." : "Keeping your flight, passenger and account details together."}</p>
        </div>
      )}

      {stage === "recovery" && (
        <div className="wizard-panel wizard-recovery-panel">
          <span className="wizard-status-icon"><Clock3 size={26} aria-hidden /></span>
          <div className="wizard-recovery-copy"><p className="wizard-status-title">{loginRequired ? "One quick sign-in" : "Your flight details are safe"}</p><p className="wizard-helper">{loginRequired ? "Your account is ready. Sign in to finish adding the flight." : "Your account is ready. The trip couldn’t be saved just now, but you can retry without starting over."}</p></div>
          {error && <Alert tone="warning" title={error} />}
          {loginRequired ? <Button asChild variant="signal" size="lg" className="wizard-primary"><Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Sign in to continue <ArrowRight size={16} aria-hidden /></Link></Button> : <Button type="button" variant="signal" size="lg" className="wizard-primary" onClick={() => void saveFlight()}>Retry adding the flight <ArrowRight size={16} aria-hidden /></Button>}
          <Button asChild variant="outline" className="w-full"><Link href="/app">Open my dashboard</Link></Button>
        </div>
      )}

      {stage === "flight" && (
        <div className="onboarding-login-link">Already tracking a flight? <Link href="/login">Sign in</Link></div>
      )}
      {stage !== "saving" && stage !== "recovery" && <div className="onboarding-footnote"><span><Check size={13} aria-hidden /> Free to use</span><span><Check size={13} aria-hidden /> You send your own claim</span><span><Check size={13} aria-hidden /> No legal advice</span></div>}
    </section>
  );
}
