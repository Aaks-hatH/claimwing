import { notFound, ok, parseJson, withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { chooseArrival, chooseDeparture, evidenceLabel } from "@/lib/flight-tracker";
import { minutesBetween } from "@/lib/time";
import { outcomeInput } from "@/lib/validation";
import { outcomeView } from "@/lib/dal";
import { FlightOutcome, Trip, type TimeEvidence } from "@/models";

/** Lets the passenger record what happened: disruption type, stated cause, and times they observed. */
export const PATCH = withUser<{ id: string }>(async (req, { params, user }) => {
  const input = await parseJson(req, outcomeInput);
  await connectDB();
  const trip = await Trip.findOne({ _id: params.id, userId: user.oid });
  if (!trip) throw notFound("Trip not found");
  const outcome =
    (await FlightOutcome.findOne({ tripId: trip._id, userId: user.oid })) ??
    new FlightOutcome({ tripId: trip._id, userId: user.oid, evidence: [] });

  if (input.disruption !== undefined) outcome.disruption = input.disruption;
  if (input.cause !== undefined) outcome.cause = input.cause;
  if (input.causeNote !== undefined) outcome.causeNote = input.causeNote;
  if (input.cancellationNoticeDays !== undefined) outcome.cancellationNoticeDays = input.cancellationNoticeDays;
  if (input.reroutingOffered !== undefined) outcome.reroutingOffered = input.reroutingOffered;
  if (input.deniedBoardingVoluntary !== undefined) outcome.deniedBoardingVoluntary = input.deniedBoardingVoluntary;

  const evidence = outcome.evidence as TimeEvidence[];
  const setManual = (kind: "manual_arrival" | "manual_departure", iso: string | null | undefined) => {
    if (iso === undefined) return;
    const rest = evidence.filter((e) => e.kind !== kind);
    if (iso) rest.push({ kind, time: new Date(iso), source: "manual", note: input.manualNote || "Entered by the passenger", recordedAt: new Date() });
    outcome.evidence = rest;
  };
  setManual("manual_arrival", input.manualArrival);
  setManual("manual_departure", input.manualDeparture);

  const arrival = chooseArrival(outcome.evidence as TimeEvidence[]);
  const departure = chooseDeparture(outcome.evidence as TimeEvidence[]);
  outcome.actualDeparture = departure?.time ?? undefined;
  if (arrival) {
    outcome.actualArrival = arrival.time;
    outcome.delayMinutes = minutesBetween(trip.scheduledArrival, arrival.time);
    outcome.delaySource = `${arrival.source}, ${evidenceLabel(arrival.kind)}`;
    outcome.delayKind = arrival.kind;
  } else {
    outcome.actualArrival = undefined;
    outcome.delayMinutes = undefined;
    outcome.delaySource = undefined;
    outcome.delayKind = undefined;
  }
  outcome.markModified("evidence");
  await outcome.save();
  if (input.manualArrival && trip.tracking?.status !== "landed") {
    trip.set("tracking.status", "landed");
    await trip.save();
  }
  return ok({ outcome: outcomeView(outcome.toObject()) });
});
