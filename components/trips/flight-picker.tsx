"use client";

import { ChevronLeft, ChevronRight, Plane } from "lucide-react";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FlightOption = {
  origin: string;
  destination: string;
  originCity: string | null;
  destinationCity: string | null;
  flightDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  icao24?: string | null;
  status?: string | null;
  source?: string | null;
};

function day(d: string) {
  const dt = DateTime.fromISO(d);
  return dt.isValid ? dt.toFormat("ccc d LLL") : d;
}

/** Lets the person choose which flight and which day is theirs. Nothing is picked for them. */
export function FlightPicker({
  flightLabel,
  date,
  options,
  selected,
  onSelect,
  onShiftDay,
  busy,
}: {
  flightLabel: string;
  date: string;
  options: FlightOption[];
  selected: number | null;
  onSelect: (i: number) => void;
  onShiftDay: (delta: -1 | 1) => void;
  busy?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {options.length === 1 ? "Is this your flight?" : `Which ${flightLabel} is yours?`}
        </p>
        <div className="flex items-center gap-1" role="group" aria-label="Search another day">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onShiftDay(-1)}>
            <ChevronLeft aria-hidden /> Day before
          </Button>
          <span className="px-2 text-xs text-muted-foreground">Searched {day(date)}</span>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onShiftDay(1)}>
            Day after <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
      <ul className="space-y-2" role="radiogroup" aria-label="Matching flights">
        {options.map((o, i) => {
          const active = selected === i;
          return (
            <li key={`${o.flightDate}-${o.departureTime}-${o.origin}-${o.destination}`}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(i)}
                className={cn("w-full rounded-2xl border p-4 text-left transition-colors hover:bg-muted", active && "border-foreground bg-card")}
              >
                <span className="flex items-center gap-3 font-display text-2xl">
                  {o.origin} <Plane className="size-4 text-signal" aria-hidden /> {o.destination}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {o.originCity ?? o.origin} to {o.destinationCity ?? o.destination}
                </span>
                <span className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <span>
                    <span className="text-muted-foreground">Departs </span>
                    <span className="font-medium">
                      {day(o.flightDate)}, {o.departureTime}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Arrives </span>
                    <span className="font-medium">
                      {day(o.arrivalDate)}, {o.arrivalTime}
                    </span>
                  </span>
                </span>
                {o.status && <span className="mt-2 block text-xs capitalize text-muted-foreground">Status: {o.status}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Times are local at each airport. Pick the one that matches your boarding pass. Not listed? Try the day before or after.</p>
    </div>
  );
}
