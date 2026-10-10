import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { env } from "./env";
import type { ClaimContext } from "./claims";
import { formatDuration } from "./time";
import { CAUSES } from "./rules/config";
import { formatMoney } from "./format";

/**
 * Claim letter from stored facts only. Anything we don't know becomes a [PLACEHOLDER]
 * the passenger must fill in. The letter never states facts we didn't record.
 */
export function templateLetter(ctx: NonNullable<ClaimContext>): string {
  const t = ctx.trip;
  const o = ctx.origin;
  const d = ctx.destination;
  const local = (date: Date | string | null | undefined, tz: string | null | undefined) =>
    date ? DateTime.fromJSDate(new Date(date)).setZone(tz ?? "UTC").toFormat("d LLLL yyyy 'at' HH:mm") : "[TIME]";
  const today = DateTime.now().toFormat("d LLLL yyyy");
  const lines: string[] = [];

  lines.push(t.passengerName, ctx.user.email, "[YOUR POSTAL ADDRESS]", "", today, "", `${ctx.airlineName} Customer Relations`, "");
  const subject = ctx.includeFlight && ctx.includeBags ? "Compensation and baggage claim" : ctx.includeBags ? "Baggage claim" : "Compensation claim";
  lines.push(`Re: ${subject}, flight ${t.flightNumber} on ${t.flightDate}, ${t.origin} to ${t.destination}`);
  lines.push(`Booking reference: ${t.bookingRef || "[BOOKING REFERENCE]"}`, "", "Dear Sir or Madam,", "");

  lines.push(
    `I was a passenger on flight ${t.flightNumber}, scheduled to depart ${o?.name ?? t.origin} (${t.origin}) on ${local(t.scheduledDeparture, o?.tz)} and arrive at ${d?.name ?? t.destination} (${t.destination}) on ${local(t.scheduledArrival, d?.tz)} local time.`,
  );

  if (ctx.includeFlight) {
    const out = ctx.outcome;
    const e = ctx.eligibility?.primary;
    if (out?.disruption === "cancellation") {
      lines.push(
        "",
        `The flight was cancelled. ${out.cancellationNoticeDays != null ? `I was informed ${out.cancellationNoticeDays} day${out.cancellationNoticeDays === 1 ? "" : "s"} before the scheduled departure.` : "I was informed [WHEN YOU WERE TOLD]."}`,
      );
    } else if (out?.disruption === "denied_boarding") {
      lines.push("", "I was denied boarding against my will, although I presented myself for check-in on time with a confirmed reservation.");
    } else if (out?.actualArrival && out.delayMinutes != null) {
      lines.push(
        "",
        `The flight arrived at ${t.destination} on ${local(out.actualArrival, d?.tz)} local time, ${formatDuration(out.delayMinutes)} after the scheduled arrival time. This time is from ${out.delaySource ?? "my records"}; a full timeline with sources is enclosed.`,
      );
    } else {
      lines.push("", "The flight arrived significantly late, at [ACTUAL ARRIVAL TIME WHEN THE DOORS OPENED].");
    }

    const cause = CAUSES[(out?.cause ?? "unknown") as keyof typeof CAUSES];
    if (out?.cause && out.cause !== "unknown") {
      lines.push(`The reason given was: ${cause.label.toLowerCase()}.${out.causeNote ? ` ${out.causeNote}` : ""}`);
    } else {
      lines.push("I was not given a reason for the disruption.");
    }

    if (e && e.applies && e.kind === "compensation" && e.amount && e.currency) {
      const distance = ctx.eligibility ? `${Math.round(ctx.eligibility.distanceKm).toLocaleString("en")} km` : "[DISTANCE]";
      lines.push(
        "",
        `This flight is covered by ${e.regimeName}. Under Article 7, I request compensation of ${formatMoney(e.amount, e.currency)} for this flight of ${distance} great-circle distance.`,
      );
      if (out?.disruption === "delay" || !out?.disruption) {
        lines.push(
          "The Court of Justice of the European Union confirmed in Sturgeon v Condor (C-402/07 and C-432/07) that passengers arriving three hours or more late are entitled to this compensation, and in Germanwings (C-452/13) that arrival time is when at least one door is opened.",
        );
      }
      lines.push(
        "If you consider that extraordinary circumstances apply, please provide evidence of them and of the reasonable measures taken to avoid the delay, as required by Article 5(3).",
      );
    } else if (e && e.regime === "US_DOT" && e.kind === "refund") {
      lines.push("", `I request a full refund of my ticket under ${e.ruleApplied} (${e.citations[0]?.label}).${t.ticketPrice?.amount ? ` My fare was ${formatMoney(t.ticketPrice.amount, t.ticketPrice.currency ?? "USD")}.` : " My fare was [TICKET PRICE]."}`);
    } else {
      lines.push("", "I request compensation for this disruption of [AMOUNT AND LEGAL BASIS].");
    }
  }

  for (const b of ctx.bags) {
    const bag = b.bag;
    const tag = bag.tagNumber || "[BAG TAG NUMBER]";
    const pir = bag.pirReference || "[PROPERTY IRREGULARITY REPORT REFERENCE]";
    lines.push("");
    if (bag.status === "arrived_damaged") {
      lines.push(
        `My checked bag (${bag.description}, tag ${tag}) arrived damaged. I received it on ${bag.receivedAt ? local(bag.receivedAt, d?.tz) : "[DATE RECEIVED]"}. This letter is my written complaint under Article 31(2) of the Montreal Convention. Photographs taken at check-in and at baggage claim are enclosed, showing the damage appeared while the bag was in your care.${b.markers.length ? ` I have marked ${b.markers.length} area${b.markers.length === 1 ? "" : "s"} of damage.` : ""} Report reference: ${pir}.`,
      );
    } else if (bag.status === "delayed") {
      lines.push(
        `My checked bag (${bag.description}, tag ${tag}) did not arrive with me${bag.reportedMissingAt ? ` and I reported it on ${local(bag.reportedMissingAt, d?.tz)}` : ""}${bag.deliveredAt ? `. It was delivered on ${local(bag.deliveredAt, d?.tz)}` : ""}. Under Articles 19 and 31 of the Montreal Convention I claim the reasonable costs I incurred because of the delay. Report reference: ${pir}.`,
      );
    } else if (bag.status === "lost") {
      lines.push(`My checked bag (${bag.description}, tag ${tag}) was lost. Under Article 17 of the Montreal Convention I claim the value of the bag and its contents. Report reference: ${pir}.`);
    } else {
      lines.push(`My checked bag (${bag.description}, tag ${tag}) is documented in the enclosed photographs.`);
    }
    const value = bag.estimatedValue?.amount != null ? formatMoney(bag.estimatedValue.amount, bag.estimatedValue.currency ?? "USD") : null;
    if (bag.status !== "documented" && bag.status !== "received_ok") {
      lines.push(
        `I claim ${value ?? "[AMOUNT]"}${bag.receipts?.length ? `; ${bag.receipts.length} receipt${bag.receipts.length === 1 ? " is" : "s are"} enclosed` : "; [ATTACH RECEIPTS OR PROOF OF VALUE]"}.`,
      );
    }
  }

  lines.push(
    "",
    "Please pay the amount due to [PAYMENT DETAILS] and reply within 14 days. An evidence packet with the flight timeline, data sources and photographs is enclosed.",
    "",
    "Yours faithfully,",
    "",
    t.passengerName,
  );
  return lines.join("\n");
}

/**
 * Optional language polish by an LLM. Facts are protected: the result is rejected if it
 * drops a [PLACEHOLDER] or introduces a number that wasn't in the original.
 */
export async function polishLetter(original: string): Promise<{ text: string; changed: boolean; reason?: string }> {
  if (!env.anthropicKey()) return { text: original, changed: false, reason: "AI polish isn't enabled on this server." };
  const client = new Anthropic({ apiKey: env.anthropicKey() });
  const res = await client.messages.create({
    model: env.anthropicModel(),
    max_tokens: 2500,
    system:
      "You improve the clarity and tone of a passenger's claim letter to an airline. Rules: keep every fact, date, time, amount, flight number, reference, legal citation and every [PLACEHOLDER IN BRACKETS] exactly as written. Do not add any new facts, numbers, dates, case law or claims. Do not remove paragraphs. Keep it firm, polite and concise. Return only the letter text.",
    messages: [{ role: "user", content: original }],
  });
  const text = res.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("")
    .trim();
  if (!text) return { text: original, changed: false, reason: "The AI returned nothing." };

  const placeholders = original.match(/\[[A-Z][A-Z0-9 ,.'/-]*\]/g) ?? [];
  const missing = placeholders.filter((p) => !text.includes(p));
  if (missing.length) return { text: original, changed: false, reason: `Rejected: the AI removed ${missing.join(", ")}.` };
  const nums = (s: string) => new Set(s.match(/\d+(?:[.,]\d+)*/g) ?? []);
  const before = nums(original);
  const added = [...nums(text)].filter((n) => !before.has(n));
  if (added.length) return { text: original, changed: false, reason: `Rejected: the AI introduced numbers not in your letter (${added.slice(0, 3).join(", ")}).` };
  return { text, changed: text !== original };
}
