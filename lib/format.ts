export function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined || !currency) return "Not set";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString("en")} ${currency}`;
  }
}

export function formatMoneyList(list: Array<{ amount: number; currency: string }>) {
  if (!list.length) return null;
  return list.map((m) => formatMoney(m.amount, m.currency)).join(" + ");
}

export function formatDistance(km: number, units: "metric" | "imperial" = "metric") {
  return units === "imperial" ? `${Math.round(km * 0.621371).toLocaleString("en")} mi` : `${Math.round(km).toLocaleString("en")} km`;
}

export function formatAltitude(m: number | null | undefined, units: "metric" | "imperial" = "imperial") {
  if (m === null || m === undefined) return "Unknown";
  return units === "imperial" ? `${Math.round(m / 0.3048).toLocaleString("en")} ft` : `${Math.round(m).toLocaleString("en")} m`;
}

export function formatSpeed(ms: number | null | undefined, units: "metric" | "imperial" = "imperial") {
  if (ms === null || ms === undefined) return "Unknown";
  return units === "imperial" ? `${Math.round(ms / 0.514444)} kt` : `${Math.round(ms * 3.6)} km/h`;
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const CAUSE_OPTIONS = [
  ["unknown", "Not told / unknown"],
  ["technical", "Technical problem"],
  ["crew", "Crew shortage or illness"],
  ["overbooking", "Overbooking"],
  ["strike_airline", "Strike by the airline's own staff"],
  ["weather", "Weather"],
  ["air_traffic_control", "Air traffic control restrictions"],
  ["security", "Security risk"],
  ["strike_external", "Strike outside the airline (airport, ATC)"],
  ["other", "Other reason"],
] as const;

export const ANGLE_LABELS: Record<string, { label: string; hint: string }> = {
  front: { label: "Front", hint: "The main face of the bag, filling the frame." },
  back: { label: "Back", hint: "Turn the bag around. Include any straps or panels." },
  left: { label: "Left side", hint: "Stand the bag up and shoot the left side." },
  right: { label: "Right side", hint: "Now the right side." },
  top: { label: "Top and handle", hint: "Top panel with the carry handle and telescopic handle." },
  bottom: { label: "Bottom and wheels", hint: "Tilt the bag. Show the wheels and feet clearly." },
  tag: { label: "Bag tag", hint: "The airline bag tag barcode and number, readable." },
  scale: { label: "Check-in scale", hint: "Optional: the weight shown on the check-in scale." },
};

export const CONTENTS_LABELS: Record<string, string> = {
  clothing: "Clothing",
  electronics: "Electronics",
  sports: "Sports equipment",
  business: "Business items",
  baby: "Baby equipment",
  medical: "Medical items",
  mixed: "Mixed contents",
  other: "Other",
};

export const BAG_STATUS_LABELS: Record<string, string> = {
  documented: "Documented",
  received_ok: "Received OK",
  arrived_damaged: "Arrived damaged",
  delayed: "Delayed",
  lost: "Lost",
};
