"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Camera, Check, FileCheck2, GitBranch, Plane, Radar, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/overlays";
import { useGuidance } from "@/components/help/guidance";
import { cn } from "@/lib/utils";
import { TrackFlightWizard } from "./track-flight";

type Existing = { id: string; flightNumber: string; flightDate: string; origin: { iata: string }; destination: { iata: string } };

const STEPS = ["Welcome", "Flight", "Forecast", "Reports", "Evidence", "Done"];

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
            Skip
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
                <h1 className="text-4xl sm:text-5xl">Hi, {name}.</h1>
                
                <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    [Radar, "Track", "Live times"],
                    [GitBranch, "Forecast", "Delay risk"],
                    [FileCheck2, "Claim", "Evidence, letter"],
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
                <h2 className="text-3xl">Add a flight</h2>
                
                <div className="mt-6">
                  <TrackFlightWizard defaultName={name} existing={existing} initialTripId={tripId} onDone={setTripId} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-3xl">Forecast</h2>
                <ul className="mt-5 space-y-3 text-base">
                  <li className="flex gap-3"><Plane className="mt-1 size-4 shrink-0 text-signal" aria-hidden /> Observed times, with sources</li>
                  <li className="flex gap-3"><GitBranch className="mt-1 size-4 shrink-0 text-signal" aria-hidden /> Forecasts never count toward claims</li>
                  <li className="flex gap-3"><Radar className="mt-1 size-4 shrink-0 text-signal" aria-hidden /> A late incoming plane can delay yours</li>
                </ul>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-3xl">Passenger reports</h2>
                
                <label className="mt-6 flex items-center justify-between gap-4 rounded-2xl border p-4">
                  <span>
                    <span className="flex items-center gap-2 font-medium">
                      <Users className="size-4 text-signal" aria-hidden /> Share my observations
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">Anonymous.</span>
                  </span>
                  <Switch checked={share} onCheckedChange={(v) => void setSharing(v)} aria-label="Share my observations" />
                </label>
                <p className="mt-4 text-sm">
                  <Link href="/demo?s=cascade" className="font-medium underline decoration-signal underline-offset-4">
                    Watch the demo
                  </Link>
                </p>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-3xl">Evidence</h2>
                <ul className="mt-5 space-y-3 text-base">
                  <li className="flex gap-3"><Camera className="mt-1 size-4 shrink-0 text-signal" aria-hidden /> Photograph your bag at check-in</li>
                  <li className="flex gap-3"><FileCheck2 className="mt-1 size-4 shrink-0 text-signal" aria-hidden /> Claim letter from recorded facts</li>
                </ul>
              </div>
            )}

            {step === 5 && (
              <div className="text-center">
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
                  <Check className="size-7" aria-hidden />
                </motion.div>
                <h2 className="mt-4 text-3xl">Done</h2>
                
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
          <Button onClick={next}>{step === 1 && !tripId ? "Skip" : "Next"}</Button>
        ) : (
          <Button onClick={() => leave("completed")} disabled={finishing}>
            {tripId ? "Open flight" : "Dashboard"}
          </Button>
        )}
      </div>
    </div>
  );
}
