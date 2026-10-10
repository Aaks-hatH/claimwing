"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FilePlus2, Scale } from "lucide-react";
import { toast } from "sonner";
import type { BagView, ClaimView, OutcomeView, TripView } from "@/lib/dal";
import type { FlightEligibility } from "@/lib/rules/engine";
import { formatMoney } from "@/lib/format";
import { formatLocal } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, NativeSelect } from "@/components/ui/primitives";
import { Alert, NotLegalAdvice, StatusBadge } from "@/components/ui/feedback";

export function ClaimPanel({
  trip,
  outcome,
  eligibility,
  bags,
  claims,
}: {
  trip: TripView;
  outcome: OutcomeView;
  eligibility: FlightEligibility | null;
  bags: BagView[];
  claims: ClaimView[];
}) {
  const router = useRouter();
  const problemBags = bags.filter((b) => ["arrived_damaged", "delayed", "lost"].includes(b.status));
  const flightWorth = eligibility?.primary && eligibility.primary.status !== "not_eligible";
  const [type, setType] = useState<"flight" | "baggage" | "combined">(flightWorth && problemBags.length ? "combined" : problemBags.length ? "baggage" : "flight");
  const [selected, setSelected] = useState<string[]>(problemBags.map((b) => b.id));
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip.id, type, baggageIds: type === "flight" ? [] : selected }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't start the claim");
      router.push(`/app/claims/${body.claim.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the claim");
      setBusy(false);
    }
  }

  const applicable = eligibility?.results.filter((r) => r.applies) ?? [];
  const notApplicable = eligibility?.results.filter((r) => !r.applies) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {trip.demoMode && <Alert tone="info" title="Demo replay">Results here come from a stored demonstration flight. Don&apos;t submit this claim.</Alert>}
        {!outcome?.actualArrival && outcome?.disruption !== "cancellation" && outcome?.disruption !== "denied_boarding" && (
          <Alert tone="info" title="No arrival time yet">
            The delay is measured when the flight arrives. You can also enter the time the doors opened on the Flight tab.
          </Alert>
        )}
        {applicable.length === 0 && (
          <Card>
            <CardContent className="flex gap-3 p-5 text-sm">
              <Scale className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">No regime we check covers this flight</p>
                <p className="text-muted-foreground">
                  We check EU261, UK261 and US DOT rules. Other countries have their own rules (for example Canada&apos;s APPR or Brazil&apos;s ANAC), which we don&apos;t assess yet.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        {applicable.map((r) => (
          <Card key={r.regime}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{r.regimeName}</CardTitle>
                <CardDescription>{r.ruleApplied}</CardDescription>
              </div>
              <StatusBadge status={r.status} />
            </CardHeader>
            <CardContent className="space-y-3">
              {r.amount != null && r.currency && r.kind !== "none" && (
                <p className="text-2xl font-semibold tabular-nums">
                  {r.minAmount ? `${formatMoney(r.minAmount, r.currency)}–` : ""}
                  {formatMoney(r.amount, r.currency)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{r.kind === "refund" ? "refund, if you didn't travel" : "compensation"}</span>
                </p>
              )}
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {r.explanation.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
                {r.citations.map((c, i) => (
                  <p key={i}>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                        {c.label} <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : (
                      c.label
                    )}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {notApplicable.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Not applicable: {notApplicable.map((r) => `${r.regime} (${r.coverage.replace(/\.$/, "")})`).join("; ")}.
          </p>
        )}

        {bags.map(
          (b) =>
            b.eligibility && (
              <Card key={b.id}>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Bag: {b.description}</CardTitle>
                    <CardDescription>{b.eligibility.convention === "montreal" ? "Montreal Convention" : "Domestic flight: national rules"}</CardDescription>
                  </div>
                  <StatusBadge status={b.eligibility.status} />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <ul className="list-disc space-y-1.5 pl-5">
                    {b.eligibility.explanation.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                  {b.eligibility.deadlines.length > 0 && (
                    <div className="rounded-lg border">
                      {b.eligibility.deadlines.map((d) => (
                        <div key={d.kind} className="flex flex-wrap justify-between gap-2 border-b px-3 py-2 last:border-0">
                          <span className="font-medium">{d.label}</span>
                          <span className="tabular-nums">{formatLocal(d.dueAt, trip.destination.tz, { withZone: false })}</span>
                          <span className="w-full text-xs text-muted-foreground">{d.basis}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ),
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Start a claim</CardTitle>
            <CardDescription>Builds a letter and an evidence packet from what you&apos;ve recorded. Nothing is sent to the airline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="claimType" className="text-sm font-medium">
                Claim for
              </label>
              <NativeSelect id="claimType" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="flight">Flight disruption</option>
                <option value="baggage" disabled={!bags.length}>
                  Baggage
                </option>
                <option value="combined" disabled={!bags.length}>
                  Flight and baggage together
                </option>
              </NativeSelect>
            </div>
            {type !== "flight" && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Bags to include</legend>
                {bags.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={selected.includes(b.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id)))}
                    />
                    {b.description}
                  </label>
                ))}
              </fieldset>
            )}
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={start} loading={busy} disabled={type !== "flight" && selected.length === 0}>
              {!busy && <FilePlus2 />} Start claim
            </Button>
          </CardFooter>
        </Card>

        {claims.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Claims for this trip</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {claims.map((c) => (
                <Link key={c.id} href={`/app/claims/${c.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/50">
                  <span>
                    <span className="block font-medium capitalize">{c.type} claim</span>
                    <span className="text-xs text-muted-foreground">{c.amount && c.currency ? formatMoney(c.amount, c.currency) : "No amount"}</span>
                  </span>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
        <NotLegalAdvice />
      </div>
    </div>
  );
}
