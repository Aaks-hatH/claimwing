"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Camera, Check, FileCheck2, GitBranch, Plane, Radar, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/overlays";
import { Term } from "@/components/help/term";
import { useGuidance } from "@/components/help/guidance";
import { cn } from "@/lib/utils";
import { TrackFlightWizard } from "./track-flight";

type Existing = { id: string; flightNumber: string; flightDate: string; origin: { iata: string }; destination: { iata: string } };

const STEPS = ["Welcome", "Your flight", "Status and forecasts", "Flight Ripple", "Evidence", "Done"];

export function WelcomeWizard({ name, existing, initialTripId, sharing }: { name: string; existing: Existing[]; initialTripId: string | null; sharing: boolean }) {
  const router = useRouter();
  const g = useGuidance();
  const [step, setStep] = useState(0);
  const [tripId, setTripId] = useState<string | null>(initialTripId);
  const [share, setShare] = useState(sharing);
  const [finishing, setFinishing] = useState(false);

  async function leave(kind: "completed" | "skipped") {
    setFinishing(true);
    try {
      await g?.setOnboarding(kind);
    } catch {
      toast.error("Couldn't save that you finished the tour. It may appear again.");
    }
    router.push(kind === "completed" && tripId ? `/app/trips/${tripId}?tab=ripple` : "/app");
  }

  async function setSharing(on: boolean) {
    setShare(on);
    const r = await fetch("/api/ripple/sharing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) }).catch(() => null);
    if (!r?.ok) {
      setShare(!on);
      toast.error("Couldn't change sharing. You can do it later in Settings.");
    }
  }

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
        {step < STEPS.length - 1 && (
          <Button variant="ghost" size="sm" onClick={() => leave("skipped")} disabled={finishing}>
            Skip the tour
          </Button>
        )}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
        <motion.div className="h-full rounded-full bg-signal" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.4 }} />
      </div>
      <ol className="mt-3 hidden gap-4 text-xs text-muted-foreground sm:flex" aria-hidden>
        {STEPS.map((s, i) => (
          <li key={s} className={cn(i === step && "font-medium text-foreground", i < step && "text-signal")}>
            {s}
          </li>
        ))}
      </ol>

      <section className="mt-6 rounded-3xl border bg-card p-6 sm:p-8" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
            {step === 0 && (
              <div>
                <h1 className="text-4xl sm:text-5xl">Welcome, {name}.</h1>
                <p className="mt-4 max-w-[58ch] leading-relaxed text-muted-foreground">
                  ClaimWing keeps the record when a flight or a bag goes wrong: real departure and arrival times with their sources, photos of your bag before and after, and a forecast of delays while you wait. When something does go wrong, it helps you prepare the claim.
                </p>
                <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    [Radar, "Track", "Live times, labelled by source"],
                    [GitBranch, "Forecast", "Delay risk, including the aircraft flying in"],
                    [FileCheck2, "Claim", "Evidence and a letter, built from facts"],
                  ].map(([I, t, d]) => {
                    const Icon = I as typeof Radar;
                    return (
                      <li key={t as string} className="rounded-2xl border bg-background/60 p-4">
                        <Icon className="size-5 text-signal" aria-hidden />
                        <p className="mt-2 font-medium">{t as string}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{d as string}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-3xl">Add your next flight</h2>
                <p className="mt-2 text-muted-foreground">Or pick one you already added. You can skip this and add a flight later.</p>
                <div className="mt-6">
                  <TrackFlightWizard defaultName={name} existing={existing} initialTripId={tripId} onDone={setTripId} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-3xl">Status, forecasts and the aircraft</h2>
                <ul className="mt-5 space-y-4 text-sm leading-relaxed">
                  <li className="flex gap-3">
                    <Plane className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
                    <span>
                      <span className="font-medium">Observed times</span> come from flight data or the aircraft&apos;s own position reports (<Term id="adsb">ADS-B</Term>). Each one shows its source, because airlines sometimes dispute delays.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <GitBranch className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
                    <span>
                      <span className="font-medium">Forecasts</span> estimate how late you&apos;ll be. They are always labelled as predictions and never count toward compensation.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <Radar className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
                    <span>
                      <span className="font-medium">The incoming aircraft.</span> Your plane usually flies in from somewhere else first. If it&apos;s late, the <Term id="turnaround">turnaround</Term> before your flight gets shorter and the delay can pass on to you (<Term id="propagation">delay propagation</Term>).
                    </span>
                  </li>
                </ul>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-3xl">Flight Ripple and passenger reports</h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  People on the same flight can report what they see: boarding starting, a gate change, a delay announcement. ClaimWing combines reports from different people, gives recent ones more weight, and marks contradictions. One report alone is shown as unverified.
                </p>
                <label className="mt-6 flex items-center justify-between gap-4 rounded-2xl border p-4">
                  <span>
                    <span className="flex items-center gap-2 font-medium">
                      <Users className="size-4 text-signal" aria-hidden /> Share my observations
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">Others see a summary like &ldquo;2 people, 4 min ago&rdquo;, never your name, email or booking. You can change this in Settings.</span>
                  </span>
                  <Switch checked={share} onCheckedChange={(v) => void setSharing(v)} aria-label="Share my observations" />
                </label>
                <p className="mt-4 text-sm">
                  <Link href="/demo?s=cascade" className="font-medium underline decoration-signal underline-offset-4">
                    See a simulated cascade in the Demo Center
                  </Link>
                </p>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-3xl">Evidence and claims</h2>
                <ul className="mt-5 space-y-4 text-sm leading-relaxed">
                  <li className="flex gap-3">
                    <Camera className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
                    <span>
                      <span className="font-medium">Photograph your bag at check-in.</span> If it arrives damaged, take the same photos at the carousel. ClaimWing compares them and you confirm any damage. Report damage within 7 days (<Term id="montreal">Montreal Convention</Term>).
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <FileCheck2 className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
                    <span>
                      <span className="font-medium">Claim readiness.</span> After the flight, a checklist shows what&apos;s missing and how to add it. The letter uses only facts you recorded; anything unknown stays as a [PLACEHOLDER].
                    </span>
                  </li>
                </ul>
              </div>
            )}

            {step === 5 && (
              <div className="text-center">
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
                  <Check className="size-7" aria-hidden />
                </motion.div>
                <h2 className="mt-4 text-3xl">You&apos;re set</h2>
                <p className="mx-auto mt-2 max-w-[48ch] text-muted-foreground">
                  {tripId ? "Your flight is being tracked. Open it to see the forecast, or go to your dashboard." : "Add a flight whenever you're ready. Help is under the ? button on every page."}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={back} disabled={step === 0 || finishing}>
          <ArrowLeft aria-hidden /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>{step === 1 && !tripId ? "Skip this step" : "Continue"}</Button>
        ) : (
          <Button onClick={() => leave("completed")} disabled={finishing}>
            {tripId ? "Open my flight" : "Go to my dashboard"}
          </Button>
        )}
      </div>
    </div>
  );
}
