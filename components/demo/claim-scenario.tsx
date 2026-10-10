"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Circle, FileCheck2, FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import { evaluateFlight } from "@/lib/rules/engine";
import { CAUSES } from "@/lib/rules/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ControlBar, usePlayer } from "./player";

const STEPS = ["Delay", "Arrival", "Evidence", "Eligibility", "Deadlines", "Letter", "Export"];
const NARRATION = [
  "Delay builds. Estimates only.",
  "Arrived 3 h 41 min late. Recorded.",
  "What the claim needs.",
  "Rules engine checks the facts.",
  "Time limits.",
  "Letter from recorded facts.",
  "Export, then verify.",
];

const TIMELINE = [
  { at: "10:05", text: "Scheduled departure", kind: "Scheduled" },
  { at: "09:40", text: "New departure 11:00", kind: "Estimated" },
  { at: "11:10", text: "Technical fault, 13:30", kind: "Estimated" },
  { at: "12:05", text: "Meal vouchers", kind: "Observed" },
  { at: "13:42", text: "Left gate, 3 h 37 late", kind: "Observed" },
  { at: "16:21", text: "Arrived, 3 h 41 late", kind: "Observed" },
];

const FACTS = {
  origin: { iata: "LHR", country: "GB", lat: 51.47, lon: -0.4543 },
  destination: { iata: "LIS", country: "PT", lat: 38.7742, lon: -9.1342 },
  airlineCountry: "GB",
  arrivalDelayMinutes: 221,
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function ClaimScenario() {
  const p = usePlayer(STEPS.length, 6500);
  const [boardingPass, setBoardingPass] = useState(false);
  const [receipts, setReceipts] = useState(false);
  const [letter, setLetter] = useState("");
  const [manifest, setManifest] = useState<Array<{ file: string; sha256: string }> | null>(null);
  const [verify, setVerify] = useState<null | "ok" | { changed: string[] }>(null);
  const [busy, setBusy] = useState(false);

  const result = useMemo(
    () =>
      evaluateFlight({
        origin: FACTS.origin,
        destination: FACTS.destination,
        airlineCountry: FACTS.airlineCountry,
        disruption: "delay",
        arrivalDelayMinutes: FACTS.arrivalDelayMinutes,
        delayEvidenceKind: "gate_arrival",
        cause: "technical",
      }),
    [],
  );
  const primary = result.primary;

  const draft = useMemo(
    () =>
      [
        "[YOUR NAME]",
        "[YOUR POSTAL ADDRESS]",
        "",
        "Re: Compensation claim, flight ZX418 on 20 November 2026, LHR to LIS (simulated)",
        `Booking reference: ${boardingPass ? "ZX7Q2M (simulated)" : "[BOOKING REFERENCE]"}`,
        "",
        "Dear Sir or Madam,",
        "",
        "I was a passenger on flight ZX418, scheduled to arrive in Lisbon at 12:40 local time. The aircraft reached the gate at 16:21, 3 hours 41 minutes late.",
        `You told passengers the delay was caused by a technical fault. ${CAUSES.technical.explanation}`,
        primary && primary.amount ? `Under ${primary.regimeName}, I am claiming compensation of £${primary.amount} for a flight of this distance.` : "",
        receipts ? "I also enclose receipts for meals bought during the delay." : "",
        "",
        "Please reply within 28 days.",
        "",
        "Yours faithfully,",
        "[YOUR NAME]",
      ]
        .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
        .join("\n"),
    [boardingPass, receipts, primary],
  );

  useEffect(() => {
    // Reset clears everything the viewer changed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoardingPass(false);
    setReceipts(false);
    setManifest(null);
    setVerify(null);
    setLetter("");
  }, [p.resetToken]);

  useEffect(() => {
    // Draft is regenerated from facts until the viewer edits it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!manifest) setLetter(draft);
  }, [draft, manifest]);

  const evidenceJson = JSON.stringify({ simulated: true, flight: "ZX418", scheduledArrival: "2026-11-20T12:40:00Z", gateArrival: "2026-11-20T16:21:00Z", source: "Simulated flight data", cause: "technical", boardingPass, receipts }, null, 2);
  const missing = [!boardingPass && "Boarding pass", letter.includes("[YOUR NAME]") && "Name and address"].filter(Boolean) as string[];

  async function exportPacket() {
    setBusy(true);
    const m = [
      { file: "claim-letter.txt", sha256: await sha256(letter) },
      { file: "flight-evidence.json", sha256: await sha256(evidenceJson) },
    ];
    setManifest(m);
    setVerify(null);
    setBusy(false);
  }
  async function verifyPacket() {
    if (!manifest) return;
    const now = { "claim-letter.txt": await sha256(letter), "flight-evidence.json": await sha256(evidenceJson) } as Record<string, string>;
    const changed = manifest.filter((m) => now[m.file] !== m.sha256).map((m) => m.file);
    setVerify(changed.length ? { changed } : "ok");
  }

  const step = p.index;
  return (
    <div className="space-y-5">
      <div className="z-20 lg:sticky lg:top-[4.5rem]">
        <ControlBar p={p} labels={STEPS} title="Claim preparation" />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-3xl border border-signal/30 bg-info-soft/60 p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-xs font-medium text-signal">
            <FlaskConical className="size-3.5" aria-hidden /> ZX418 · {step + 1}/{STEPS.length}
          </p>
          <p className="mt-1 font-display text-xl">{STEPS[step]}</p>
          <p className="mt-1 max-w-[50ch] text-base">{NARRATION[step]}</p>
        </motion.div>
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border bg-card p-5" aria-labelledby="claim-timeline">
          <h3 id="claim-timeline" className="text-xl">
            Timeline
          </h3>
          <ol className="mt-3 space-y-2">
            {TIMELINE.slice(0, step === 0 ? 4 : TIMELINE.length).map((e, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex gap-3 text-sm">
                <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{e.at}</span>
                <span className="flex-1">{e.text}</span>
                <Badge tone={e.kind === "Observed" ? "success" : e.kind === "Estimated" ? "warning" : "neutral"}>{e.kind}</Badge>
              </motion.li>
            ))}
          </ol>
        </section>

        {step >= 2 && (
          <section className="rounded-3xl border bg-card p-5" aria-labelledby="claim-evidence">
            <h3 id="claim-evidence" className="text-xl">
              Evidence
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <Check ok label="Arrival time" />
              <Check ok label="Airline reason" />
              <Check ok={boardingPass} label="Boarding pass" action={!boardingPass ? <Button size="sm" variant="outline" onClick={() => setBoardingPass(true)}>Add</Button> : null} />
              <Check ok={receipts} optional label="Receipts" action={!receipts ? <Button size="sm" variant="ghost" onClick={() => setReceipts(true)}>Add</Button> : null} />
            </ul>
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">{[true, true, boardingPass].filter(Boolean).length}/3</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div className="h-full rounded-full bg-success" animate={{ width: `${([true, true, boardingPass].filter(Boolean).length / 3) * 100}%` }} />
              </div>
            </div>
          </section>
        )}

        {step >= 3 && primary && (
          <section className="rounded-3xl border bg-card p-5" aria-labelledby="claim-elig">
            <h3 id="claim-elig" className="flex items-center gap-2 text-xl">
              <ShieldCheck className="size-4 text-signal" aria-hidden /> Eligibility
            </h3>
            <p className="mt-2 font-display text-2xl">{result.summary}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {primary.explanation.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{primary.ruleApplied}</p>
          </section>
        )}

        {step >= 4 && (
          <section className="rounded-3xl border bg-card p-5" aria-labelledby="claim-deadlines">
            <h3 id="claim-deadlines" className="text-xl">
              Deadlines
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>6 years in England and Wales. 5 in Scotland.</li>
              <li className="text-muted-foreground">Airline may call the fault extraordinary.</li>
              {missing.length > 0 && (
                <li className="flex gap-2 text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Missing: {missing.join(", ")}
                </li>
              )}
            </ul>
          </section>
        )}

        {step >= 5 && (
          <section className="rounded-3xl border bg-card p-5 lg:col-span-2" aria-labelledby="claim-letter">
            <h3 id="claim-letter" className="text-xl">
              Letter
            </h3>
            <label htmlFor="claim-letter-text" className="sr-only">
              Letter
            </label>
            <Textarea id="claim-letter-text" value={letter} onChange={(e) => setLetter(e.target.value)} rows={12} className="mt-3 font-mono text-xs leading-relaxed" />
            {step >= 6 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={exportPacket} disabled={busy || missing.includes("Boarding pass")}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileCheck2 aria-hidden />} {manifest ? "Export again" : "Export"}
                </Button>
                <Button variant="outline" onClick={verifyPacket} disabled={!manifest}>
                  <ShieldCheck aria-hidden /> Verify
                </Button>
              </div>
            )}
            {manifest && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl border bg-background/60 p-4 text-xs">
                <p className="flex items-center gap-2 font-medium text-success">
                  <CheckCircle2 className="size-4" aria-hidden /> Exported
                </p>
                <ul className="mt-2 space-y-1 font-mono">
                  {manifest.map((m) => (
                    <li key={m.file} className="break-all">
                      {m.file}: {m.sha256}
                    </li>
                  ))}
                </ul>
                {verify === "ok" && <p className="mt-3 font-medium text-success">Verified</p>}
                {verify && verify !== "ok" && (
                  <p role="alert" className="mt-3 font-medium text-danger">
                    Changed: {verify.changed.join(", ")}
                  </p>
                )}
              </motion.div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Check({ ok, label, optional, action }: { ok: boolean; label: string; optional?: boolean; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> : <Circle className={cn("size-4 shrink-0", optional ? "text-muted-foreground" : "text-warning")} aria-hidden />}
      <span className={cn("flex-1", !ok && "text-muted-foreground")}>
        {label}
        {optional ? " (optional)" : ""}
        <span className="sr-only">{ok ? ": done" : ": missing"}</span>
      </span>
      {action}
    </li>
  );
}
