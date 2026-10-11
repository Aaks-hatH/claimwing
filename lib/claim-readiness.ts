import type { ClaimContext } from "./claims";

/**
 * Claim readiness from real, stored state only. Each item says why it matters and where to fix it.
 * Forecasts and passenger observations never make a claim "ready": they are listed as context.
 */
export type ReadinessItem = {
  id: string;
  label: string;
  status: "done" | "missing" | "warning" | "optional";
  why: string;
  fix?: { href: string; label: string };
  required: boolean;
};

export type Readiness = {
  items: ReadinessItem[];
  done: number;
  required: number;
  deadlines: Array<{ label: string; dueAt: string | null; basis: string; hard: boolean; passed: boolean }>;
  timeLimitNote: string | null;
};

const PLACEHOLDER = /\[[A-Z][A-Z0-9 ,.'/-]*\]/g;

export function claimReadiness(ctx: NonNullable<ClaimContext>, opts: { now: Date; observations: number }): Readiness {
  const trip = ctx.trip;
  const tripUrl = `/app/trips/${trip._id}`;
  const items: ReadinessItem[] = [];

  if (ctx.includeFlight) {
    const o = ctx.outcome;
    const kind = o?.delayKind ?? null;
    const approx = kind === "adsb_last_contact" || kind === "adsb_on_ground" || kind === "runway_arrival";
    items.push({
      id: "arrival",
      label: "Recorded arrival time",
      status: !o?.actualArrival && o?.disruption !== "cancellation" ? "missing" : approx ? "warning" : "done",
      why: !o?.actualArrival
        ? o?.disruption === "cancellation"
          ? "Cancelled: no arrival time is needed, but record when you were told."
          : "Compensation depends on when the doors opened at your destination. A forecast doesn't count."
        : approx
          ? "This time comes from runway or position data, which is a few minutes earlier than gate arrival. Add the gate time if you know it."
          : `Recorded from ${o.delaySource ?? "flight data"}.`,
      fix: !o?.actualArrival || approx ? { href: `${tripUrl}?tab=flight`, label: "Record the arrival time" } : undefined,
      required: o?.disruption !== "cancellation",
    });
    items.push({
      id: "cause",
      label: "Reason the airline gave",
      status: !o?.cause || o.cause === "unknown" ? "missing" : "done",
      why: "The reason decides whether the airline can refuse compensation (extraordinary circumstances). If you weren't told, ask in writing.",
      fix: !o?.cause || o.cause === "unknown" ? { href: `${tripUrl}?tab=flight`, label: "Add the reason" } : undefined,
      required: true,
    });
    const p = ctx.eligibility?.primary;
    items.push({
      id: "eligibility",
      label: "Rules checked",
      status: !p ? "warning" : p.status === "eligible" ? "done" : "warning",
      why: !p
        ? "No regime Vola checks covers this flight. You can still claim care costs from the airline."
        : p.status === "needs_review"
          ? `Needs a closer look: ${p.explanation[p.explanation.length - 1]}`
          : p.status === "not_eligible"
            ? "The recorded facts don't meet the rules for compensation. You can still claim refunds or care costs."
            : ctx.eligibility!.summary,
      fix: { href: `${tripUrl}?tab=claim`, label: "See the rules" },
      required: false,
    });
  }
  items.push({
    id: "booking",
    label: "Booking reference",
    status: trip.bookingRef ? "done" : "missing",
    why: "Airlines use it to find your booking. It's on your confirmation email or boarding pass.",
    fix: trip.bookingRef ? undefined : { href: `${tripUrl}/edit`, label: "Add it" },
    required: true,
  });

  for (const b of ctx.bags) {
    const before = b.photos.filter((x) => x.stage === "before").length;
    const after = b.photos.filter((x) => x.stage === "after").length;
    const bagUrl = `${tripUrl}/baggage/${b.bag._id}`;
    const name = b.bag.description;
    items.push({ id: `before-${b.bag._id}`, label: `${name}: check-in photos`, status: before ? "done" : "missing", why: "Without photos from before the flight, the airline may say the damage was already there.", fix: before ? undefined : { href: bagUrl, label: "Add photos" }, required: true });
    if (b.bag.status === "arrived_damaged") {
      items.push({ id: `after-${b.bag._id}`, label: `${name}: arrival photos`, status: after ? "done" : "missing", why: "Photos at the carousel show the damage at arrival.", fix: after ? undefined : { href: bagUrl, label: "Add photos" }, required: true });
      items.push({ id: `marks-${b.bag._id}`, label: `${name}: damage confirmed`, status: b.markers.length ? "done" : "missing", why: "Only damage you confirm goes into the packet. Suggestions from comparison or AI need your confirmation.", fix: b.markers.length ? undefined : { href: bagUrl, label: "Review and mark damage" }, required: true });
    }
    if (["arrived_damaged", "delayed", "lost"].includes(b.bag.status)) {
      items.push({ id: `pir-${b.bag._id}`, label: `${name}: airline report (PIR)`, status: b.bag.pirReference ? "done" : "missing", why: "The report you file at the baggage desk before leaving the airport. Its reference proves you reported it in time.", fix: b.bag.pirReference ? undefined : { href: bagUrl, label: "Add the reference" }, required: true });
      items.push({ id: `receipts-${b.bag._id}`, label: `${name}: receipts`, status: b.bag.receipts?.length ? "done" : "optional", why: "Receipts for repairs, replacements or essentials you bought support the amount you claim.", fix: b.bag.receipts?.length ? undefined : { href: bagUrl, label: "Add receipts" }, required: false });
    }
  }

  const placeholders = (ctx.claim.letterText.match(PLACEHOLDER) ?? []).length;
  items.push({
    id: "letter",
    label: "Letter details filled in",
    status: ctx.claim.letterText ? (placeholders ? "missing" : "done") : "missing",
    why: placeholders ? `${placeholders} [PLACEHOLDER]${placeholders === 1 ? "" : "S"} still in the letter. Replace them with your details.` : ctx.claim.letterText ? "Every fact in the letter came from your records." : "Build the letter from your recorded facts.",
    fix: placeholders || !ctx.claim.letterText ? { href: "#claim-letter", label: "Edit the letter" } : undefined,
    required: true,
  });
  if (opts.observations > 0) {
    items.push({
      id: "observations",
      label: `Your ${opts.observations} observation${opts.observations === 1 ? "" : "s"} in Flight Ripple`,
      status: "optional",
      why: "Useful for your own timeline (for example when a delay was announced). They're your notes, not proof, so they aren't added to the packet.",
      fix: { href: `${tripUrl}?tab=ripple`, label: "See them" },
      required: false,
    });
  }

  const deadlines = ctx.bags.flatMap((b) =>
    (b.eligibility?.deadlines ?? []).map((d) => ({ label: `${d.label} (${b.bag.description})`, dueAt: d.dueAt, basis: d.basis, hard: d.hard, passed: new Date(d.dueAt).getTime() < opts.now.getTime() })),
  );
  const regime = ctx.eligibility?.primary?.regime ?? null;
  const timeLimitNote =
    regime === "UK261"
      ? "UK261 claims follow national time limits: 6 years in England and Wales, 5 years in Scotland."
      : regime === "EU261"
        ? "EU261 has no single deadline: each country sets its own (from about 1 to 6 years). Claim as soon as you can."
        : regime === "US_DOT"
          ? "Ask for a refund promptly; airlines must process eligible refunds within 7 business days (card) or 20 days (other payment)."
          : null;

  const required = items.filter((i) => i.required);
  return { items, done: required.filter((i) => i.status === "done" || i.status === "warning").length, required: required.length, deadlines, timeLimitNote };
}
