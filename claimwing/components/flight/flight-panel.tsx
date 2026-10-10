"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Circle, Info, Radio, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { TrackerState } from "@/lib/flight-tracker";
import type { TripView } from "@/lib/dal";
import { formatDuration, formatLocal, formatUtc, relativeTime } from "@/lib/time";
import { formatAltitude, formatSpeed } from "@/lib/format";
import { rightsChecklist } from "@/lib/rules/rights";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives";
import { Alert, Badge, StatusBadge, type StatusKey } from "@/components/ui/feedback";
import { ChangeFlash } from "@/components/ui/change-flash";
import { AltitudeChart } from "./altitude-chart";
import { cn } from "@/lib/utils";

const FlightMap = dynamic(() => import("./flight-map"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });

export function FlightPanel({
  trip,
  initial,
  regime,
  units,
}: {
  trip: TripView;
  initial: TrackerState;
  regime: { id: string | null; distanceKm: number; domesticUs: boolean };
  units: "metric" | "imperial";
}) {
  const router = useRouter();
  const [state, setState] = useState<TrackerState>(initial);
  const [polling, setPolling] = useState(false);
  const [offline, setOffline] = useState(false);
  const lastKey = useRef(`${initial.status}|${initial.outcome?.delayMinutes ?? ""}|${initial.outcome?.disruption ?? ""}`);

  const poll = useCallback(async () => {
    setPolling(true);
    try {
      const res = await fetch(`/api/flights/${trip.id}/poll`, { method: "POST", cache: "no-store" });
      if (res.status === 429) return;
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed");
      const next = (await res.json()) as TrackerState;
      setState(next);
      setOffline(false);
      const key = `${next.status}|${next.outcome?.delayMinutes ?? ""}|${next.outcome?.disruption ?? ""}`;
      if (key !== lastKey.current) {
        lastKey.current = key;
        router.refresh(); // eligibility and overview depend on these facts
      }
    } catch {
      setOffline(true);
    } finally {
      setPolling(false);
    }
  }, [trip.id, router]);

  useEffect(() => {
    if (!state.active || !state.nextPollSeconds) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (ms: number) => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await poll();
        schedule((state.nextPollSeconds ?? 20) * 1000);
      }, ms);
    };
    schedule(state.lastPolledAt ? 1500 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active, state.nextPollSeconds, poll]);

  const last = state.track[state.track.length - 1];
  const tz = { o: trip.origin.tz, d: trip.destination.tz };
  const out = state.outcome;
  const ev = (k: string) => out?.evidence.find((e) => e.kind === k);
  const actualDep = ev("manual_departure") ?? ev("gate_departure") ?? ev("runway_departure") ?? ev("adsb_airborne");
  const estDelay = state.estimatedDelayMinutes;
  const showAlert = estDelay !== null && estDelay >= 150 && state.status !== "landed" && !out?.actualArrival;
  const delay = out?.delayMinutes ?? null;

  const statusKey: StatusKey =
    state.status === "landed" ? (delay !== null && delay >= 15 ? "delayed" : delay !== null ? "on_time" : "landed") : (state.status as StatusKey);

  const checklist =
    regime.id &&
    (showAlert || (delay ?? 0) >= 120 || state.status === "cancelled") &&
    rightsChecklist({
      regime: regime.id,
      distanceKm: regime.distanceKm,
      expectedDelayMinutes: delay ?? estDelay ?? 0,
      cancelled: state.status === "cancelled",
      overnight: (() => {
        const t = out?.actualArrival ?? state.estimatedArrival;
        if (!t) return false;
        return formatLocal(t, tz.d, { withZone: false }).slice(0, 15) !== formatLocal(trip.scheduledArrival, tz.d, { withZone: false }).slice(0, 15);
      })(),
      domesticUs: regime.domesticUs,
    });

  return (
    <div className="space-y-6">
      {state.demo && (
        <Alert
          tone="info"
          title="Demo replay"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await fetch(`/api/trips/${trip.id}/replay`, { method: "POST" });
                toast.success("Replay restarted");
                router.refresh();
                const s = await fetch(`/api/flights/${trip.id}/poll`).then((r) => r.json());
                setState(s);
              }}
            >
              <RotateCcw /> Restart
            </Button>
          }
        >
          This flight is a stored replay running about 90× faster than real time, so times shown are on the replay clock. Nothing here comes from a live source.
        </Alert>
      )}

      {showAlert && (
        <Alert tone="warning" icon={AlertTriangle} title={`Your flight may qualify for compensation. Expected about ${formatDuration(estDelay)} late.`}>
          Keep your boarding pass and receipts, and ask the airline in writing for the reason. Below is what you&apos;re owed while you wait.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="relative h-72 border-b sm:h-96">
          <FlightMap origin={{ ...trip.origin, name: trip.origin.name }} destination={{ ...trip.destination, name: trip.destination.name }} track={state.track} label={trip.flightNumber} />
          {state.track.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 m-3 rounded-lg border bg-background/90 p-3 text-sm backdrop-blur">
              {state.active
                ? "Waiting for the aircraft to appear on live tracking. Position data usually starts at pushback or takeoff."
                : new Date(trip.scheduledDeparture).getTime() > new Date(state.now).getTime()
                  ? "Live tracking starts 3 hours before departure."
                  : "No position data was recorded for this flight."}
            </div>
          )}
        </div>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4">
          <div className="flex items-center gap-2">
            <ChangeFlash value={statusKey} announce={`Flight status changed`}>
              <StatusBadge status={statusKey} />
            </ChangeFlash>
            {state.active && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Radio className={cn("size-3.5", polling ? "animate-pulse text-primary" : "")} aria-hidden />
                {polling ? "Updating…" : state.lastPolledAt ? `Updated ${relativeTime(state.lastPolledAt)}` : "Live"}
              </span>
            )}
          </div>
          {last && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="inline text-muted-foreground">Altitude </dt>
                <dd className="inline tabular-nums">{last.gnd ? "On ground" : formatAltitude(last.alt, units === "metric" ? "metric" : "imperial")}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Speed </dt>
                <dd className="inline tabular-nums">{formatSpeed(last.gs, units === "metric" ? "metric" : "imperial")}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Position at </dt>
                <dd className="inline tabular-nums">{formatUtc(last.t)}</dd>
              </div>
            </dl>
          )}
          <div className="ml-auto flex items-center gap-2">
            {state.icao24 && (
              <Badge tone="neutral" className="font-mono" title={state.icao24Source ?? undefined}>
                {state.callsign ?? ""} {state.icao24}
              </Badge>
            )}
            {state.active && (
              <Button size="sm" variant="outline" onClick={poll} loading={polling} aria-label="Refresh now">
                {!polling && <RefreshCw />} Refresh
              </Button>
            )}
          </div>
        </CardContent>
        {(offline || state.errors.length > 0) && (
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">
            {offline ? "Can't reach the server right now. We'll keep trying." : `Data source note: ${state.errors.join("; ")}`}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Departure</CardTitle>
            <CardDescription>
              {trip.origin.iata} · {trip.origin.city ?? trip.origin.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <TimeRow label="Scheduled" value={formatLocal(trip.scheduledDeparture, tz.o)} />
            <TimeRow
              label="Actual"
              value={actualDep ? formatLocal(actualDep.time, tz.o) : "Not recorded yet"}
              source={actualDep ? `${actualDep.label} · ${actualDep.source}` : undefined}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Arrival</CardTitle>
            <CardDescription>
              {trip.destination.iata} · {trip.destination.city ?? trip.destination.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <TimeRow label="Scheduled" value={formatLocal(trip.scheduledArrival, tz.d)} />
            {out?.actualArrival ? (
              <TimeRow label="Actual" value={formatLocal(out.actualArrival, tz.d)} source={out.delaySource ?? undefined} />
            ) : (
              <ChangeFlash value={state.estimatedArrival} className="block w-full" announce="Estimated arrival updated">
                <TimeRow
                  label="Estimated"
                  value={state.estimatedArrival ? formatLocal(state.estimatedArrival, tz.d) : "Not available yet"}
                  source={state.estimatedArrivalSource ?? undefined}
                />
              </ChangeFlash>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{delay !== null ? "Arrival delay" : "Expected arrival delay"}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {delay !== null ? formatDuration(delay) : estDelay !== null ? formatDuration(estDelay) : "Not known yet"}
            </p>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              {delay !== null
                ? `Measured against the scheduled arrival. Source: ${out?.delaySource}.`
                : "We'll measure the final delay when the flight arrives."}{" "}
              Airlines measure arrival when the doors open, which can be a few minutes after touchdown, so every time below shows where it came from.
            </p>
          </div>
          {delay !== null && <StatusBadge status={delay >= 15 ? "delayed" : "on_time"} className="self-start sm:self-center" />}
        </CardContent>
      </Card>

      {checklist && (
        <Card>
          <CardHeader>
            <CardTitle>{checklist.title}</CardTitle>
            <CardDescription>{checklist.citation}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {checklist.items.map((i) => (
                <li key={i.id} className="flex gap-3 text-sm">
                  {i.applies ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Applies now" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not yet" />
                  )}
                  <div>
                    <p className={cn("font-medium", !i.applies && "text-muted-foreground")}>{i.label}</p>
                    <p className="text-muted-foreground">{i.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {state.track.some((p) => !p.gnd) && (
        <Card>
          <CardHeader>
            <CardTitle>Altitude profile</CardTitle>
            <CardDescription>From live position reports, times in UTC.</CardDescription>
          </CardHeader>
          <CardContent>
            <AltitudeChart track={state.track} units={units} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Time evidence</CardTitle>
          <CardDescription>Every time we recorded, with its source. Airlines sometimes dispute delay times, so keep this.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {out?.evidence.length ? (
            <ul className="divide-y">
              {out.evidence.map((e, i) => (
                <li key={i} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[12rem_1fr_auto] sm:items-center sm:gap-4">
                  <span className="font-medium capitalize">{e.label}</span>
                  <span className="text-muted-foreground">
                    {e.source}
                    {e.note ? `: ${e.note}` : ""}
                  </span>
                  <span className="tabular-nums">{formatUtc(e.time)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 px-5 pb-5 text-sm text-muted-foreground">
              <Info className="size-4" aria-hidden /> Nothing recorded yet. Times appear as the flight departs and lands.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TimeRow({ label, value, source }: { label: string; value: string; source?: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>
        <span className="tabular-nums">{value}</span>
        {source && <span className="block text-xs text-muted-foreground">{source}</span>}
      </span>
    </div>
  );
}
