"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import type { RippleResult } from "@/lib/ripple/engine";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Term } from "@/components/help/term";
import { rangeText } from "./format";

const STEPS = ["Observed or predicted?", "The incoming aircraft", "Turnaround and reports", "What's missing", "What to do now"];

/** Walks through the current forecast in plain language, using only what the result actually contains. */
export function DisruptionGuide({ r, mode }: { r: RippleResult; mode: "live" | "simulation" }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const by = (k: RippleResult["factors"][number]["kind"]) => r.factors.filter((f) => f.kind === k);
  const link = r.rotation.links[0];
  const incoming = r.rotation.legs.find((l) => l.role === "incoming");
  const strong = r.reports.claims.filter((c) => c.level === "strong" || c.level === "some");

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => (setStep(0), setOpen(true))}>
        <Compass aria-hidden /> Explain this to me
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Details</DialogTitle>
            <DialogDescription>
              {step + 1}/{STEPS.length} {STEPS[step]}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-56 text-sm leading-relaxed">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }} className="space-y-3">
                {step === 0 && (
                  <>
                                        <Group title="Observed (recorded by flight data)" items={by("observed").map((f) => f.detail)} empty="Nothing recorded yet." />
                    <Group title="Reported by passengers" items={by("reported").map((f) => f.detail)} empty="No corroborated reports." />
                    <Group title="Predicted" items={by("predicted").map((f) => f.detail)} empty="No predictions yet." />
                  </>
                )}
                {step === 1 && (
                  <>
                    {r.rotation.confidence === "unknown" ? (
                      <p>Aircraft unknown.</p>
                    ) : incoming ? (
                      <p>
                        Your aircraft, {r.rotation.registration}, flies in as {incoming.flightNumber} from {incoming.origin}. Its arrival is{" "}
                        {incoming.arrivalDelay ? `${incoming.arrivalDelay.state} at ${rangeText(incoming.arrivalDelay)}` : "not estimated yet"}.
                        {r.rotation.confidence === "planned" ? " (planned)" : ""}
                      </p>
                    ) : (
                      <p>{r.rotation.registration}: no earlier flight.</p>
                    )}
                  </>
                )}
                {step === 2 && (
                  <>
                    {link?.step ? (
                      <p>{link.step.explanation}</p>
                    ) : (
                      <p>No <Term id="turnaround">turnaround</Term> data.</p>
                    )}
                    {strong.length ? (
                      <p>
                        {strong.map((c) => `${c.sentence.toLowerCase()} (${c.contributorsLabel}, ${c.levelLabel.toLowerCase()})`).join("; ")}.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">No corroborated reports.</p>
                    )}
                  </>
                )}
                {step === 3 && (
                  <>
                    <Group title="Missing" items={r.dataQuality.missing} empty="Nothing missing." />
                    <Group title="Out of date" items={r.dataQuality.stale} empty="Nothing out of date." />
                    <Group title="Conflicts" items={r.dataQuality.conflicts} empty="No conflicts." />
                  </>
                )}
                {step === 4 && (
                  <ul className="list-disc space-y-1.5 pl-5">
                    {r.horizon.stage === "predeparture" && <li>Stay near the gate.</li>}
                    {(r.expectedArrivalDelay.range?.mid ?? 0) >= 120 && <li>Ask for meals. Keep receipts.</li>}
                    {mode === "live" && <li>Report what you see.</li>}
                    <li>Claims use the recorded arrival.</li>
                  </ul>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft aria-hidden /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Next <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button onClick={() => setOpen(false)}>Done</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Group({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
