import Link from "next/link";
import { ArrowRight, Camera, FileText, Receipt, Scale, ShieldCheck, Timer } from "lucide-react";
import type { BagView, ClaimView, OutcomeView, TripView } from "@/lib/dal";
import type { FlightEligibility } from "@/lib/rules/engine";
import { nowMs } from "@/lib/time";

type Action = { id: string; icon: typeof Camera; title: string; body: string; href: string; cta: string };

/**
 * What to do next, from the trip's real state. A forecast never makes a claim "ready":
 * claims depend on the confirmed arrival time and the eligibility engine, as everywhere else.
 */
export function NextActions({
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
  const now = nowMs();
  const dep = new Date(trip.scheduledDeparture).getTime();
  const landed = Boolean(outcome?.actualArrival);
  const estimateLate = trip.estimatedArrival ? (new Date(trip.estimatedArrival).getTime() - new Date(trip.scheduledArrival).getTime()) / 60_000 : null;
  const actions: Action[] = [];

  if (!landed && now < dep + 6 * 3600_000) {
    actions.push({
      id: "rights",
      icon: Scale,
      title: "Know what you're owed while you wait",
      body: "Meals, calls, rebooking and hotels depend on the delay and the rules for your route. The Flight tab lists them for this flight.",
      href: "?tab=flight",
      cta: "See your rights",
    });
  }
  if (!landed && (estimateLate ?? 0) >= 60) {
    actions.push({
      id: "receipts",
      icon: Receipt,
      title: "Keep receipts",
      body: "If you buy food or a hotel because of the delay, keep the receipts. They support a claim for care costs.",
      href: "?tab=flight",
      cta: "Record what happened",
    });
  }
  if (now < dep && !bags.some((b) => b.beforeCount > 0)) {
    actions.push({
      id: "bag",
      icon: Camera,
      title: "Photograph your bag before check-in",
      body: "Before-and-after photos are the strongest evidence if it arrives damaged.",
      href: "?tab=baggage",
      cta: "Add a bag",
    });
  }
  if (landed && eligibility?.primary && eligibility.primary.status !== "not_eligible" && !claims.length) {
    actions.push({
      id: "claim",
      icon: FileText,
      title: "Start a claim",
      body: `${eligibility.summary} This uses the recorded arrival time, not the forecast.`,
      href: "?tab=claim",
      cta: "Prepare the claim",
    });
  }
  if (landed && (!outcome?.cause || outcome.cause === "unknown")) {
    actions.push({
      id: "cause",
      icon: ShieldCheck,
      title: "Record the reason the airline gave",
      body: "The cause decides whether compensation applies. Ask the airline in writing if you weren't told.",
      href: "?tab=flight",
      cta: "Add the cause",
    });
  }
  for (const b of bags) {
    const d = b.eligibility?.deadlines?.find((x) => new Date(x.dueAt).getTime() > now);
    if (d) {
      actions.push({ id: `deadline-${b.id}`, icon: Timer, title: `${d.label} for ${b.description}`, body: `${d.basis}. Send it to the airline in writing.`, href: `/app/trips/${trip.id}/baggage/${b.id}`, cta: "Open bag" });
      break;
    }
  }

  return (
    <section className="rounded-3xl border bg-card p-5" aria-labelledby="ripple-next">
      <h3 id="ripple-next" className="text-xl">
        Your next steps
      </h3>
      {actions.length ? (
        <ul className="mt-3 space-y-3">
          {actions.slice(0, 4).map((a) => (
            <li key={a.id} className="rounded-2xl border bg-background/60 p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <a.icon className="size-4 shrink-0 text-signal" aria-hidden /> {a.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.body}</p>
              <Link href={a.href} className="group mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground underline decoration-signal underline-offset-4">
                {a.cta} <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nothing to do right now. ClaimWing keeps recording the flight for you.</p>
      )}
    </section>
  );
}
