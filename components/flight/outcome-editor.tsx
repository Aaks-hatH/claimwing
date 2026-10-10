"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";
import type { OutcomeView, TripView } from "@/lib/dal";
import { CAUSE_OPTIONS } from "@/lib/format";
import { CAUSES } from "@/lib/rules/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label, NativeSelect, Textarea } from "@/components/ui/primitives";

function toLocalInput(iso: string | null | undefined, tz: string | null) {
  if (!iso) return "";
  return DateTime.fromISO(iso).setZone(tz ?? "UTC").toFormat("yyyy-LL-dd'T'HH:mm");
}
function fromLocalInput(v: string, tz: string | null) {
  if (!v) return null;
  const dt = DateTime.fromISO(v, { zone: tz ?? "UTC" });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

/** What happened to the flight, in the passenger's words. Feeds the eligibility engine. */
export function OutcomeEditor({ trip, outcome, manualArrival, manualDeparture }: { trip: TripView; outcome: OutcomeView; manualArrival: string | null; manualDeparture: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [disruption, setDisruption] = useState(outcome?.disruption ?? "delay");
  const [cause, setCause] = useState(outcome?.cause ?? "unknown");
  const [causeNote, setCauseNote] = useState(outcome?.causeNote ?? "");
  const [notice, setNotice] = useState(outcome?.cancellationNoticeDays?.toString() ?? "");
  const [rerouting, setRerouting] = useState(outcome?.reroutingOffered == null ? "" : outcome.reroutingOffered ? "yes" : "no");
  const [voluntary, setVoluntary] = useState(outcome?.deniedBoardingVoluntary == null ? "" : outcome.deniedBoardingVoluntary ? "yes" : "no");
  const [arr, setArr] = useState(toLocalInput(manualArrival, trip.destination.tz));
  const [dep, setDep] = useState(toLocalInput(manualDeparture, trip.origin.tz));

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/flights/${trip.id}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disruption,
          cause,
          causeNote: causeNote || null,
          cancellationNoticeDays: disruption === "cancellation" && notice !== "" ? Number(notice) : null,
          reroutingOffered: disruption === "cancellation" && rerouting ? rerouting === "yes" : null,
          deniedBoardingVoluntary: disruption === "denied_boarding" && voluntary ? voluntary === "yes" : null,
          manualArrival: fromLocalInput(arr, trip.destination.tz),
          manualDeparture: fromLocalInput(dep, trip.origin.tz),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save");
      toast.success("Saved. Eligibility updated.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const causeInfo = CAUSES[cause as keyof typeof CAUSES];

  return (
    <Card>
      <CardHeader>
        <CardTitle>What happened</CardTitle>
        
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="disruption">Disruption</Label>
          <NativeSelect id="disruption" value={disruption} onChange={(e) => setDisruption(e.target.value as typeof disruption)}>
            <option value="delay">Delayed</option>
            <option value="cancellation">Cancelled</option>
            <option value="denied_boarding">Denied boarding (overbooked)</option>
            <option value="none">No problem</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cause">Reason given by the airline</Label>
          <NativeSelect id="cause" value={cause} onChange={(e) => setCause(e.target.value as typeof cause)}>
            {CAUSE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
          {causeInfo && <p className="text-xs text-muted-foreground">{causeInfo.explanation}</p>}
        </div>

        {disruption === "cancellation" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="notice">Days of notice before departure</Label>
              <Input id="notice" type="number" min={0} max={365} inputMode="numeric" value={notice} onChange={(e) => setNotice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rerouting">Were you offered another flight?</Label>
              <NativeSelect id="rerouting" value={rerouting} onChange={(e) => setRerouting(e.target.value)}>
                <option value="">Not sure</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </NativeSelect>
            </div>
          </>
        )}
        {disruption === "denied_boarding" && (
          <div className="space-y-1.5">
            <Label htmlFor="voluntary">Gave up seat voluntarily?</Label>
            <NativeSelect id="voluntary" value={voluntary} onChange={(e) => setVoluntary(e.target.value)}>
              <option value="">Choose</option>
              <option value="no">No, I was refused boarding</option>
              <option value="yes">Yes, I volunteered</option>
            </NativeSelect>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="manualDep">Departed (local)</Label>
          <Input id="manualDep" type="datetime-local" value={dep} onChange={(e) => setDep(e.target.value)} />
          <p className="text-xs text-muted-foreground">{trip.origin.iata} time zone</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manualArr">Doors opened (local)</Label>
          <Input id="manualArr" type="datetime-local" value={arr} onChange={(e) => setArr(e.target.value)} />
          <p className="text-xs text-muted-foreground">{trip.destination.iata} time zone. This is the time that counts legally.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="causeNote">Notes</Label>
          <Textarea id="causeNote" rows={3} maxLength={1000} value={causeNote} onChange={(e) => setCauseNote(e.target.value)} placeholder="e.g. Captain announced a hydraulic fault at 09:40." />
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={save} loading={busy}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
