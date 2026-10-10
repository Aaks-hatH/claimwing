import rights from "./rights.json";

type When = "care" | "overnight" | "fiveHours" | "cancelled" | "always" | "refundThreshold";

export type RightItem = { id: string; label: string; detail: string; applies: boolean; when: When };

export type RightsChecklist = { regime: string; title: string; citation: string; items: RightItem[] };

type RegimeKey = keyof typeof rights;

/**
 * Builds the "what you are owed right now" checklist from rights.json.
 * Care starts at 2/3/4 hours depending on distance (EU/UK Art. 6(1)).
 */
export function rightsChecklist(opts: {
  regime: string;
  distanceKm: number;
  expectedDelayMinutes: number;
  cancelled: boolean;
  overnight: boolean;
  domesticUs?: boolean;
}): RightsChecklist | null {
  if (!(opts.regime in rights)) return null;
  const cfg = rights[opts.regime as RegimeKey];
  const band = opts.distanceKm <= 1500 ? "short" : opts.distanceKm <= 3500 ? "medium" : "long";
  const careFrom = cfg.careFromMinutesByBand[band];
  const refundThreshold = opts.domesticUs ? 180 : 360;
  const items = cfg.items.map((i) => {
    const when = i.when as When;
    const applies =
      when === "always" ||
      (when === "care" && (opts.expectedDelayMinutes >= careFrom || opts.cancelled)) ||
      (when === "overnight" && opts.overnight) ||
      (when === "fiveHours" && opts.expectedDelayMinutes >= 300) ||
      (when === "cancelled" && opts.cancelled) ||
      (when === "refundThreshold" && (opts.cancelled || opts.expectedDelayMinutes >= refundThreshold));
    return { id: i.id, label: i.label, detail: i.detail, when, applies };
  });
  return { regime: opts.regime, title: cfg.title, citation: cfg.citation, items };
}
