"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { RippleResponse } from "@/lib/ripple/service";
import type { RippleResult } from "@/lib/ripple/engine";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { RippleView } from "./ripple-view";

type Loaded = RippleResponse & { fetchedAt: number };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  } catch {
    throw new Error("Offline");
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("Signed out");
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Something went wrong (${res.status}).`);
  return body as T;
}

/** Live Flight Ripple for one trip: loads on demand, refreshes every minute while the flight is active. */
export function RipplePanel({ tripId, nextActions }: { tripId: string; nextActions?: React.ReactNode }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [history, setHistory] = useState<Array<{ computedAt: string; result: RippleResult }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setRefreshing(true);
    try {
      const r = await api<RippleResponse>(`/api/ripple/${tripId}`);
      setData({ ...r, fetchedAt: Date.now() });
      setError(null);
      api<{ history: Array<{ computedAt: string; result: RippleResult }> }>(`/api/ripple/${tripId}/history`)
        .then((h) => setHistory(h.history))
        .catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Flight Ripple couldn't load.");
    } finally {
      inflight.current = false;
      setRefreshing(false);
      setNow(new Date());
    }
  }, [tripId]);

  useEffect(() => {
    // Initial load when the tab opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const stage = data?.result.horizon.stage;
  const active = stage === "predeparture" || stage === "enroute";
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [active, load]);

  if (!data && !error) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading Flight Ripple">
        <Skeleton className="h-56 rounded-3xl" />
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div role="alert" className="rounded-3xl border bg-card p-8 text-center">
        <AlertTriangle className="mx-auto size-6 text-warning" aria-hidden />
        <p className="mt-3 font-medium">Flight Ripple couldn&apos;t load</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw aria-hidden /> Try again
        </Button>
      </div>
    );
  }

  const disabledReason = data.demo ? (
    <>
      This is a demo trip, so reports are off here. Try passenger reports in the{" "}
      <Link href="/demo" className="font-medium text-foreground underline">
        Demo Center
      </Link>
      .
    </>
  ) : !data.sharing ? (
    <>
      Sharing observations is off.{" "}
      <Link href="/app/settings#community" className="font-medium text-foreground underline">
        Turn it on in Settings
      </Link>{" "}
      to report what you see.
    </>
  ) : undefined;

  return (
    <div className="space-y-4">
      <RippleView
        result={data.result}
        changes={data.changes}
        previousAt={data.previousAt}
        airports={data.airports}
        now={now}
        mode="live"
        myReports={data.myReports}
        history={history.length > 1 ? history : undefined}
        onRefresh={() => void load()}
        refreshing={refreshing}
        refreshError={error}
        reportDisabledReason={disabledReason}
        legAction={(k) => (data.ownTrips[k] && data.ownTrips[k] !== tripId ? { href: `/app/trips/${data.ownTrips[k]}?tab=ripple`, label: "Open your trip for this flight" } : null)}
        onSubmitReport={async (input) => {
          await api(`/api/ripple/${tripId}/reports`, { method: "POST", body: JSON.stringify(input) });
          toast.success("Shared");
          await load();
        }}
        onDeleteReport={async (id) => {
          try {
            await api(`/api/ripple/reports/${id}`, { method: "DELETE" });
            toast.success("Report deleted.");
            await load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't delete the report.");
          }
        }}
        nextActions={nextActions}
      />
    </div>
  );
}
