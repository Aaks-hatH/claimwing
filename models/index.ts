import "server-only";
import mongoose, { Schema, type Model, Types } from "mongoose";

/*
 * All user data is scoped by userId. Every query must filter on it.
 *
 * Document types are declared as explicit interfaces. Mongoose 9's automatic schema
 * type inference is very expensive for schemas this size (the type checker runs out of
 * memory), so schema definitions are passed through `def()` and typed by the interface.
 */
const def = (o: Record<string, unknown>) => o as never;

function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}

export type Money = { amount?: number | null; currency?: string | null };
const money = new Schema(def({ amount: Number, currency: { type: String, default: "USD" } }), { _id: false });

/* ---------------- User ---------------- */
export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash?: string;
  image?: string | null;
  provider: "credentials" | "google";
  preferences?: {
    units?: "metric" | "imperial";
    timeFormat?: "24h" | "12h";
    notifyDelays?: boolean;
    notifyDeadlines?: boolean;
    homeCurrency?: string;
    sdrRate?: number;
    /** Share structured flight observations with other passengers on the same flight. */
    communityReports?: boolean;
  };
  /** First-run guidance. Stored per user so it never reappears on another device. */
  guidance?: {
    onboardingCompletedAt?: Date | null;
    onboardingSkippedAt?: Date | null;
    dismissedHints?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}
const userSchema = new Schema<UserDoc>(
  def({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    image: String,
    provider: { type: String, enum: ["credentials", "google"], default: "credentials" },
    preferences: {
      units: { type: String, enum: ["metric", "imperial"], default: "metric" },
      timeFormat: { type: String, enum: ["24h", "12h"], default: "24h" },
      notifyDelays: { type: Boolean, default: true },
      notifyDeadlines: { type: Boolean, default: true },
      homeCurrency: { type: String, default: "USD" },
      sdrRate: { type: Number, default: 1.36 },
      communityReports: { type: Boolean, default: true },
    },
    guidance: {
      onboardingCompletedAt: Date,
      onboardingSkippedAt: Date,
      dismissedHints: { type: [String], default: [] },
    },
  }),
  { timestamps: true },
);
export const User = model<UserDoc>("User", userSchema);

/* ---------------- Trip ---------------- */
export type TrackingStatus = "scheduled" | "in_air" | "landed" | "cancelled" | "diverted" | "unknown";
export interface TripTracking {
  status?: TrackingStatus;
  icao24?: string | null;
  callsign?: string | null;
  icao24Source?: string | null;
  lastPolledAt?: Date | null;
  lastPositionAt?: Date | null;
  lastScheduleFetchAt?: Date | null;
  estimatedArrival?: Date | null;
  estimatedArrivalSource?: string | null;
  alertSentAt?: Date | null;
  finalizedAt?: Date | null;
  lastError?: string | null;
}
/** The aircraft a data provider assigned to this dated flight, and every earlier assignment. */
export interface TripAircraft {
  registration?: string | null;
  model?: string | null;
  source?: string | null;
  seenAt?: Date | null;
  history?: Array<{ registration: string; source: string; firstSeenAt: Date }>;
}
export interface TripDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  airline: string;
  airlineName?: string | null;
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  bookingRef?: string | null;
  passengerName: string;
  ticketPrice?: Money | null;
  operatingCarrierRegion: "auto" | "eu" | "uk" | "other";
  demoMode: boolean;
  replay?: { file?: string | null; startedAt?: Date | null; speed?: number | null } | null;
  tracking?: TripTracking;
  aircraft?: TripAircraft;
  createdAt: Date;
  updatedAt: Date;
}
const tripSchema = new Schema<TripDoc>(
  def({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    airline: { type: String, required: true, uppercase: true, trim: true },
    airlineName: String,
    flightNumber: { type: String, required: true, uppercase: true, trim: true },
    flightDate: { type: String, required: true },
    origin: { type: String, required: true, uppercase: true },
    destination: { type: String, required: true, uppercase: true },
    scheduledDeparture: { type: Date, required: true },
    scheduledArrival: { type: Date, required: true },
    bookingRef: String,
    passengerName: { type: String, required: true },
    ticketPrice: money,
    operatingCarrierRegion: { type: String, enum: ["auto", "eu", "uk", "other"], default: "auto" },
    demoMode: { type: Boolean, default: false },
    replay: { file: String, startedAt: Date, speed: { type: Number, default: 60 } },
    tracking: {
      status: { type: String, enum: ["scheduled", "in_air", "landed", "cancelled", "diverted", "unknown"], default: "scheduled" },
      icao24: String,
      callsign: String,
      icao24Source: String,
      lastPolledAt: Date,
      lastPositionAt: Date,
      lastScheduleFetchAt: Date,
      estimatedArrival: Date,
      estimatedArrivalSource: String,
      alertSentAt: Date,
      finalizedAt: Date,
      lastError: String,
    },
    aircraft: {
      registration: String,
      model: String,
      source: String,
      seenAt: Date,
      history: { type: [new Schema(def({ registration: String, source: String, firstSeenAt: Date }), { _id: false })], default: [] },
    },
  }),
  { timestamps: true },
);
tripSchema.index({ userId: 1, scheduledDeparture: -1 });
// Who follows a dated flight (used to authorize access to its shared passenger reports).
tripSchema.index({ flightNumber: 1, flightDate: 1, origin: 1 });
tripSchema.index({ "tracking.finalizedAt": 1, scheduledDeparture: 1 });
export const Trip = model<TripDoc>("Trip", tripSchema);

/* ---------------- FlightSnapshot ---------------- */
export interface SnapshotDoc {
  _id: Types.ObjectId;
  tripId: Types.ObjectId;
  userId: Types.ObjectId;
  polledAt: Date;
  observedAt: Date;
  lat: number;
  lon: number;
  altitude?: number | null;
  velocity?: number | null;
  track?: number | null;
  verticalRate?: number | null;
  onGround: boolean;
  icao24?: string | null;
  callsign?: string | null;
  source: string;
  raw?: unknown;
}
const snapshotSchema = new Schema<SnapshotDoc>(
  def({
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    polledAt: { type: Date, required: true },
    observedAt: { type: Date, required: true },
    lat: Number,
    lon: Number,
    altitude: Number,
    velocity: Number,
    track: Number,
    verticalRate: Number,
    onGround: Boolean,
    icao24: String,
    callsign: String,
    source: { type: String, required: true },
    raw: Schema.Types.Mixed,
  }),
);
snapshotSchema.index({ tripId: 1, observedAt: 1 });
export const FlightSnapshot = model<SnapshotDoc>("FlightSnapshot", snapshotSchema);

/* ---------------- FlightOutcome ---------------- */
export type EvidenceKind =
  | "gate_arrival"
  | "runway_arrival"
  | "estimated_arrival"
  | "adsb_on_ground"
  | "adsb_last_contact"
  | "gate_departure"
  | "runway_departure"
  | "adsb_airborne"
  | "manual_arrival"
  | "manual_departure";
export interface TimeEvidence {
  kind: EvidenceKind;
  time: Date;
  source: string;
  note?: string | null;
  recordedAt?: Date;
}
const EVIDENCE_KINDS: EvidenceKind[] = [
  "gate_arrival", "runway_arrival", "estimated_arrival", "adsb_on_ground", "adsb_last_contact",
  "gate_departure", "runway_departure", "adsb_airborne", "manual_arrival", "manual_departure",
];
const timeEvidence = new Schema<TimeEvidence>(
  def({
    kind: { type: String, enum: EVIDENCE_KINDS, required: true },
    time: { type: Date, required: true },
    source: { type: String, required: true },
    note: String,
    recordedAt: { type: Date, default: () => new Date() },
  }),
  { _id: false },
);

export type CauseValue =
  | "unknown" | "technical" | "crew" | "overbooking" | "weather" | "air_traffic_control" | "security" | "strike_airline" | "strike_external" | "other";
export interface OutcomeDoc {
  _id: Types.ObjectId;
  tripId: Types.ObjectId;
  userId: Types.ObjectId;
  disruption: "delay" | "cancellation" | "denied_boarding" | "none";
  actualDeparture?: Date | null;
  actualArrival?: Date | null;
  delayMinutes?: number | null;
  delaySource?: string | null;
  delayKind?: string | null;
  evidence: TimeEvidence[];
  scheduleStatus?: string | null;
  cause: CauseValue;
  causeNote?: string | null;
  causeEvidence?: unknown;
  cancellationNoticeDays?: number | null;
  reroutingOffered?: boolean | null;
  deniedBoardingVoluntary?: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
const outcomeSchema = new Schema<OutcomeDoc>(
  def({
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    disruption: { type: String, enum: ["delay", "cancellation", "denied_boarding", "none"], default: "delay" },
    actualDeparture: Date,
    actualArrival: Date,
    delayMinutes: Number,
    delaySource: String,
    delayKind: String,
    evidence: { type: [timeEvidence], default: [] },
    scheduleStatus: String,
    cause: {
      type: String,
      enum: ["unknown", "technical", "crew", "overbooking", "weather", "air_traffic_control", "security", "strike_airline", "strike_external", "other"],
      default: "unknown",
    },
    causeNote: String,
    causeEvidence: Schema.Types.Mixed,
    cancellationNoticeDays: Number,
    reroutingOffered: Boolean,
    deniedBoardingVoluntary: Boolean,
  }),
  { timestamps: true },
);
export const FlightOutcome = model<OutcomeDoc>("FlightOutcome", outcomeSchema);

/* ---------------- Baggage ---------------- */
export interface FileRef {
  _id: Types.ObjectId;
  storageKey: string;
  filename?: string | null;
  mime?: string | null;
  size?: number | null;
  sha256?: string | null;
  uploadedAt?: Date;
}
const fileRef = new Schema<FileRef>(
  def({
    storageKey: { type: String, required: true },
    filename: String,
    mime: String,
    size: Number,
    sha256: String,
    uploadedAt: { type: Date, default: () => new Date() },
  }),
);

export type BagStatus = "documented" | "received_ok" | "arrived_damaged" | "delayed" | "lost";
export const CONTENTS_CATEGORIES = ["clothing", "electronics", "sports", "business", "baby", "medical", "mixed", "other"] as const;
export interface BaggageDoc {
  _id: Types.ObjectId;
  tripId: Types.ObjectId;
  userId: Types.ObjectId;
  description: string;
  tagNumber?: string | null;
  contentsCategory: (typeof CONTENTS_CATEGORIES)[number];
  estimatedValue?: Money | null;
  status: BagStatus;
  receivedAt?: Date | null;
  reportedMissingAt?: Date | null;
  deliveredAt?: Date | null;
  pirReference?: string | null;
  receipts: FileRef[];
  remindersSent: string[];
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
const baggageSchema = new Schema<BaggageDoc>(
  def({
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    description: { type: String, required: true, maxlength: 200 },
    tagNumber: String,
    contentsCategory: { type: String, enum: CONTENTS_CATEGORIES, default: "mixed" },
    estimatedValue: money,
    status: { type: String, enum: ["documented", "received_ok", "arrived_damaged", "delayed", "lost"], default: "documented" },
    receivedAt: Date,
    reportedMissingAt: Date,
    deliveredAt: Date,
    pirReference: String,
    receipts: { type: [fileRef], default: [] },
    remindersSent: { type: [String], default: [] },
    notes: String,
  }),
  { timestamps: true },
);
baggageSchema.index({ status: 1, receivedAt: 1 });
export const BaggageItem = model<BaggageDoc>("BaggageItem", baggageSchema);

export const ANGLES = ["front", "back", "left", "right", "top", "bottom", "tag", "scale"] as const;
export type Angle = (typeof ANGLES)[number];
export interface PhotoDoc {
  _id: Types.ObjectId;
  baggageId: Types.ObjectId;
  userId: Types.ObjectId;
  stage: "before" | "after";
  angle: Angle;
  storageKey: string;
  webKey: string;
  mime?: string | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  sha256?: string | null;
  takenAt: Date;
  exifTakenAt?: Date | null;
  gps?: { lat?: number | null; lon?: number | null; accuracy?: number | null } | null;
  blurred: boolean;
  blurRect?: { x: number; y: number; w: number; h: number } | null;
  createdAt: Date;
  updatedAt: Date;
}
const photoSchema = new Schema<PhotoDoc>(
  def({
    baggageId: { type: Schema.Types.ObjectId, ref: "BaggageItem", required: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    stage: { type: String, enum: ["before", "after"], required: true },
    angle: { type: String, enum: ANGLES, required: true },
    storageKey: { type: String, required: true },
    webKey: { type: String, required: true },
    mime: String,
    size: Number,
    width: Number,
    height: Number,
    sha256: String,
    takenAt: { type: Date, required: true },
    exifTakenAt: Date,
    gps: { lat: Number, lon: Number, accuracy: Number },
    blurred: { type: Boolean, default: false },
    blurRect: { x: Number, y: Number, w: Number, h: Number },
  }),
  { timestamps: true },
);
photoSchema.index({ baggageId: 1, stage: 1, angle: 1 }, { unique: true });
export const BaggagePhoto = model<PhotoDoc>("BaggagePhoto", photoSchema);

export type Rect = { x: number; y: number; w: number; h: number };
export interface MarkerDoc {
  _id: Types.ObjectId;
  baggageId: Types.ObjectId;
  userId: Types.ObjectId;
  angle: Angle;
  rect: Rect;
  note: string;
  source: "user" | "ai" | "comparison";
  confirmed: boolean;
  dismissed: boolean;
  createdAt: Date;
}
const markerSchema = new Schema<MarkerDoc>(
  def({
    baggageId: { type: Schema.Types.ObjectId, ref: "BaggageItem", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    angle: { type: String, enum: ANGLES, required: true },
    rect: {
      x: { type: Number, min: 0, max: 1, required: true },
      y: { type: Number, min: 0, max: 1, required: true },
      w: { type: Number, min: 0, max: 1, required: true },
      h: { type: Number, min: 0, max: 1, required: true },
    },
    note: { type: String, maxlength: 500, default: "" },
    source: { type: String, enum: ["user", "ai", "comparison"], default: "user" },
    confirmed: { type: Boolean, default: true },
    dismissed: { type: Boolean, default: false },
  }),
  { timestamps: true },
);
export const DamageMarker = model<MarkerDoc>("DamageMarker", markerSchema);

/* ---------------- Claim ---------------- */
export type ClaimStatus = "draft" | "ready" | "sent" | "awaiting_reply" | "paid" | "rejected";
export interface ClaimDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tripId: Types.ObjectId;
  type: "flight" | "baggage" | "combined";
  baggageIds: Types.ObjectId[];
  eligibility?: unknown;
  amount?: number | null;
  currency?: string | null;
  letterText: string;
  letterSource: "template" | "ai_polished" | "edited";
  status: ClaimStatus;
  recoveredAmount?: number | null;
  airlineReference?: string | null;
  timeline: Array<{ at: Date; status: string; note?: string | null }>;
  lastExportAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
const claimSchema = new Schema<ClaimDoc>(
  def({
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    type: { type: String, enum: ["flight", "baggage", "combined"], required: true },
    baggageIds: [{ type: Schema.Types.ObjectId, ref: "BaggageItem" }],
    eligibility: Schema.Types.Mixed,
    amount: Number,
    currency: String,
    letterText: { type: String, default: "" },
    letterSource: { type: String, enum: ["template", "ai_polished", "edited"], default: "template" },
    status: { type: String, enum: ["draft", "ready", "sent", "awaiting_reply", "paid", "rejected"], default: "draft" },
    recoveredAmount: Number,
    airlineReference: String,
    timeline: { type: [new Schema(def({ at: { type: Date, default: () => new Date() }, status: String, note: String }), { _id: false })], default: [] },
    lastExportAt: Date,
  }),
  { timestamps: true },
);
export const Claim = model<ClaimDoc>("Claim", claimSchema);

/* ---------------- Notification ---------------- */
export interface NotificationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: "delay_alert" | "landed" | "deadline" | "claim" | "system";
  title: string;
  message: string;
  href?: string | null;
  dedupeKey: string;
  readAt?: Date | null;
  createdAt: Date;
}
const notificationSchema = new Schema<NotificationDoc>(
  def({
    userId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ["delay_alert", "landed", "deadline", "claim", "system"], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    href: String,
    dedupeKey: { type: String, required: true },
    readAt: Date,
  }),
  { timestamps: true },
);
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });
export const Notification = model<NotificationDoc>("Notification", notificationSchema);

/* ---------------- Infrastructure: shared API cache and rate limits ---------------- */
export interface ApiCacheDoc {
  key: string;
  value: unknown;
  expiresAt: Date;
}
const apiCacheSchema = new Schema<ApiCacheDoc>(
  def({ key: { type: String, required: true, unique: true }, value: Schema.Types.Mixed, expiresAt: { type: Date, required: true } }),
);
apiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ApiCache = model<ApiCacheDoc>("ApiCache", apiCacheSchema);

export interface RateLimitDoc {
  key: string;
  count: number;
  expiresAt: Date;
}
const rateLimitSchema = new Schema<RateLimitDoc>(
  def({ key: { type: String, required: true, unique: true }, count: { type: Number, default: 0 }, expiresAt: { type: Date, required: true } }),
);
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimit = model<RateLimitDoc>("RateLimit", rateLimitSchema);

/* ---------------- Flight Ripple: passenger reports ---------------- */
export const FLIGHT_REPORT_TYPES = [
  "boarding_not_started", "boarding_started", "gate_changed", "delay_announced", "doors_closed", "departed",
  "deplaning", "cancellation_announced", "incoming_aircraft_at_gate", "incoming_aircraft_not_at_gate", "landed", "bags_arriving",
] as const;
export interface FlightReportDoc {
  _id: Types.ObjectId;
  /** Dated flight key, e.g. "BA117:2026-10-10:LHR". */
  flightKey: string;
  /** Owner, for rate limits, deletion and export. Never returned to other users. */
  userId: Types.ObjectId;
  /** Pseudonymous id: an HMAC of the user and the flight, so it differs on every flight. */
  contributor: string;
  type: (typeof FLIGHT_REPORT_TYPES)[number];
  /** Production data only ever stores passenger reports; simulations never touch this collection. */
  source: "passenger";
  observedAt?: Date | null;
  value?: string | number | null;
  note?: string | null;
  moderation: "accepted" | "flagged" | "rejected";
  flags: string[];
  eligibility: number;
  /** Set when the author turns off community sharing; withdrawn reports are excluded from aggregates. */
  withdrawn: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const flightReportSchema = new Schema<FlightReportDoc>(
  def({
    flightKey: { type: String, required: true, maxlength: 40 },
    userId: { type: Schema.Types.ObjectId, required: true },
    contributor: { type: String, required: true, maxlength: 64 },
    type: { type: String, enum: FLIGHT_REPORT_TYPES, required: true },
    source: { type: String, enum: ["passenger"], default: "passenger" },
    observedAt: Date,
    value: Schema.Types.Mixed,
    note: { type: String, maxlength: 140 },
    moderation: { type: String, enum: ["accepted", "flagged", "rejected"], default: "accepted" },
    flags: { type: [String], default: [] },
    eligibility: { type: Number, min: 0, max: 1, default: 1 },
    withdrawn: { type: Boolean, default: false },
  }),
  { timestamps: true },
);
flightReportSchema.index({ flightKey: 1, createdAt: -1 });
flightReportSchema.index({ userId: 1, createdAt: -1 });
flightReportSchema.index({ flightKey: 1, contributor: 1, type: 1, createdAt: -1 });
export const FlightReport = model<FlightReportDoc>("FlightReport", flightReportSchema);

/* ---------------- Flight Ripple: versioned prediction records ---------------- */
export interface RipplePredictionDoc {
  _id: Types.ObjectId;
  flightKey: string;
  computedAt: Date;
  kind: "ml" | "fallback" | "unknown";
  modelVersion?: string | null;
  /** Hash of the inputs, so a new record is only written when something changed. */
  inputsHash: string;
  /** The full typed result (see lib/ripple/engine.ts), including sources and freshness. */
  result: unknown;
  expiresAt: Date;
}
const ripplePredictionSchema = new Schema<RipplePredictionDoc>(
  def({
    flightKey: { type: String, required: true, maxlength: 40 },
    computedAt: { type: Date, required: true },
    kind: { type: String, enum: ["ml", "fallback", "unknown"], required: true },
    modelVersion: String,
    inputsHash: { type: String, required: true },
    result: Schema.Types.Mixed,
    expiresAt: { type: Date, required: true },
  }),
);
ripplePredictionSchema.index({ flightKey: 1, computedAt: -1 });
ripplePredictionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RipplePrediction = model<RipplePredictionDoc>("RipplePrediction", ripplePredictionSchema);
