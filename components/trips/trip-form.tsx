"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label, NativeSelect } from "@/components/ui/primitives";
import { Alert, FieldError } from "@/components/ui/feedback";
import { ReferenceCombobox } from "@/components/ui/combobox";
import { tripInput } from "@/lib/validation";

type FormValues = {
  airline: string;
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  passengerName: string;
  bookingRef: string;
  priceAmount: string;
  priceCurrency: string;
  operatingCarrierRegion: "auto" | "eu" | "uk" | "other";
  icao24: string;
};

const formSchema = z
  .object({
    airline: z.string().regex(/^[A-Z0-9]{2}$/, "Pick the airline"),
    flightNumber: z.string().trim().min(1, "Enter the flight number"),
    flightDate: z.string().min(1, "Pick the departure date"),
    origin: z.string().regex(/^[A-Z]{3}$/, "Pick the departure airport"),
    destination: z.string().regex(/^[A-Z]{3}$/, "Pick the arrival airport"),
    departureTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter the scheduled departure time"),
    arrivalDate: z.string().min(1, "Pick the arrival date"),
    arrivalTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter the scheduled arrival time"),
    passengerName: z.string().trim().min(1, "Enter the passenger name"),
    bookingRef: z.string(),
    priceAmount: z.string().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Enter an amount"),
    priceCurrency: z.string(),
    operatingCarrierRegion: z.enum(["auto", "eu", "uk", "other"]),
    icao24: z.string().refine((v) => v === "" || /^[0-9a-fA-F]{6}$/.test(v), "6 hex characters"),
  })
  .refine((v) => v.origin !== v.destination, { message: "Departure and arrival must differ", path: ["destination"] });

export function TripForm({
  mode,
  tripId,
  initial,
  defaultPassenger,
  labels,
}: {
  mode: "create" | "edit";
  tripId?: string;
  initial?: Partial<FormValues>;
  defaultPassenger: string;
  labels?: { airline?: string; origin?: string; destination?: string };
}) {
  const router = useRouter();
  const [lookup, setLookup] = useState<{ busy: boolean; message?: string; tone?: "success" | "info" | "warning" }>({ busy: false });
  const [advanced, setAdvanced] = useState(Boolean(initial?.icao24 || (initial?.operatingCarrierRegion && initial.operatingCarrierRegion !== "auto")));
  const [serverError, setServerError] = useState<string | null>(null);
  const [comboKey, setComboKey] = useState(0);
  const [comboLabels, setComboLabels] = useState(labels ?? {});

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      airline: "",
      flightNumber: "",
      flightDate: "",
      origin: "",
      destination: "",
      departureTime: "",
      arrivalDate: "",
      arrivalTime: "",
      passengerName: defaultPassenger,
      bookingRef: "",
      priceAmount: "",
      priceCurrency: "USD",
      operatingCarrierRegion: "auto",
      icao24: "",
      ...initial,
    },
  });
  const { register, control, handleSubmit, setValue, getValues, formState } = form;
  const e = formState.errors;

  async function findFlight() {
    const airline = getValues("airline");
    const number = getValues("flightNumber").replace(/\s+/g, "").toUpperCase();
    const date = getValues("flightDate");
    if (!airline || !number || !date) {
      setLookup({ busy: false, tone: "warning", message: "Pick the airline, flight number and date first." });
      return;
    }
    const flight = /^\d/.test(number) ? `${airline}${number}` : number;
    setLookup({ busy: true });
    try {
      const res = await fetch(`/api/flights/lookup?flight=${encodeURIComponent(flight)}&date=${date}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Lookup failed");
      if (!body.found) {
        setLookup({ busy: false, tone: body.configured ? "warning" : "info", message: body.message });
        return;
      }
      setValue("origin", body.origin, { shouldValidate: true });
      setValue("destination", body.destination, { shouldValidate: true });
      setValue("departureTime", body.departureTime, { shouldValidate: true });
      setValue("arrivalDate", body.arrivalDate, { shouldValidate: true });
      setValue("arrivalTime", body.arrivalTime, { shouldValidate: true });
      if (body.icao24) setValue("icao24", body.icao24);
      setComboLabels((l) => ({ ...l, origin: body.origin, destination: body.destination }));
      setComboKey((k) => k + 1);
      setLookup({ busy: false, tone: "success", message: `Filled in from ${body.source}. Check it matches your booking.` });
    } catch (err) {
      setLookup({ busy: false, tone: "warning", message: err instanceof Error ? err.message : "Lookup failed" });
    }
  }

  async function onSubmit(v: FormValues) {
    setServerError(null);
    const payload = {
      airline: v.airline,
      flightNumber: v.flightNumber,
      flightDate: v.flightDate,
      origin: v.origin,
      destination: v.destination,
      departureTime: v.departureTime,
      arrivalDate: v.arrivalDate,
      arrivalTime: v.arrivalTime,
      passengerName: v.passengerName,
      bookingRef: v.bookingRef || null,
      ticketPrice: v.priceAmount ? { amount: Number(v.priceAmount), currency: v.priceCurrency || "USD" } : null,
      operatingCarrierRegion: v.operatingCarrierRegion,
      icao24: v.icao24 ? v.icao24.toLowerCase() : "",
    };
    const check = tripInput.safeParse(payload);
    if (!check.success) {
      setServerError(check.error.issues[0]?.message ?? "Check the form");
      return;
    }
    const res = await fetch(mode === "create" ? "/api/trips" : `/api/trips/${tripId}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? "Couldn't save the trip");
      return;
    }
    toast.success(mode === "create" ? "Trip added. Tracking starts 3 hours before departure." : body.reset ? "Trip updated. Tracking restarted for the new flight details." : "Trip updated");
    router.push(`/app/trips/${body.trip.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Flight</CardTitle>
          <CardDescription>Enter the flight from your booking. Times are local at each airport.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="airline">Airline</Label>
            <Controller
              control={control}
              name="airline"
              render={({ field }) => (
                <ReferenceCombobox
                  id="airline"
                  type="airline"
                  value={field.value}
                  onChange={(c) => field.onChange(c)}
                  placeholder="British Airways or BA"
                  invalid={!!e.airline}
                  initialLabel={comboLabels.airline}
                />
              )}
            />
            <FieldError message={e.airline?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="flightNumber">Flight no.</Label>
            <Input id="flightNumber" placeholder="117" inputMode="text" autoCapitalize="characters" aria-invalid={!!e.flightNumber} {...register("flightNumber")} />
            <FieldError message={e.flightNumber?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="flightDate">Departure date</Label>
            <Input id="flightDate" type="date" aria-invalid={!!e.flightDate} {...register("flightDate", { onChange: (ev) => {
                  if (!getValues("arrivalDate")) setValue("arrivalDate", ev.target.value);
                } })} />
            <FieldError message={e.flightDate?.message} />
          </div>
          <div className="sm:col-span-6">
            <Button type="button" variant="outline" size="sm" onClick={findFlight} loading={lookup.busy}>
              {!lookup.busy && <Search />} Find flight details automatically
            </Button>
            {lookup.message && <Alert className="mt-3" tone={lookup.tone ?? "info"} title={lookup.message} />}
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="origin">From</Label>
            <Controller
              control={control}
              name="origin"
              render={({ field }) => (
                <ReferenceCombobox key={`o${comboKey}`} id="origin" type="airport" value={field.value} onChange={(c) => field.onChange(c)} placeholder="City or airport code" invalid={!!e.origin} initialLabel={comboLabels.origin} />
              )}
            />
            <FieldError message={e.origin?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="destination">To</Label>
            <Controller
              control={control}
              name="destination"
              render={({ field }) => (
                <ReferenceCombobox key={`d${comboKey}`} id="destination" type="airport" value={field.value} onChange={(c) => field.onChange(c)} placeholder="City or airport code" invalid={!!e.destination} initialLabel={comboLabels.destination} />
              )}
            />
            <FieldError message={e.destination?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="departureTime">Scheduled departure (local)</Label>
            <Input id="departureTime" type="time" aria-invalid={!!e.departureTime} {...register("departureTime")} />
            <FieldError message={e.departureTime?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="arrivalDate">Arrival date</Label>
            <Input id="arrivalDate" type="date" aria-invalid={!!e.arrivalDate} {...register("arrivalDate")} />
            <FieldError message={e.arrivalDate?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="arrivalTime">Scheduled arrival (local)</Label>
            <Input id="arrivalTime" type="time" aria-invalid={!!e.arrivalTime} {...register("arrivalTime")} />
            <FieldError message={e.arrivalTime?.message} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Passenger and booking</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="passengerName">Passenger name (as on the ticket)</Label>
            <Input id="passengerName" autoComplete="name" aria-invalid={!!e.passengerName} {...register("passengerName")} />
            <FieldError message={e.passengerName?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="bookingRef">Booking reference (optional)</Label>
            <Input id="bookingRef" placeholder="ABC123" autoCapitalize="characters" {...register("bookingRef")} />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="priceAmount">Ticket price (optional)</Label>
            <div className="flex gap-2">
              <Input id="priceAmount" inputMode="decimal" placeholder="0.00" aria-invalid={!!e.priceAmount} {...register("priceAmount")} />
              <NativeSelect className="w-24" aria-label="Currency" {...register("priceCurrency")}>
                {["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "INR", "AED", "JPY"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>
            <FieldError message={e.priceAmount?.message} />
            <p className="text-xs text-muted-foreground">Used for US denied-boarding and refund estimates.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          aria-expanded={advanced}
          onClick={() => setAdvanced((a) => !a)}
        >
          <span>
            <span className="block text-[15px] font-semibold">Advanced</span>
            <span className="block text-sm text-muted-foreground">Operating airline for codeshares, aircraft transponder code</span>
          </span>
          <ChevronDown className={`size-4 transition-transform ${advanced ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {advanced && (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="operatingCarrierRegion">Who operated the flight?</Label>
              <NativeSelect id="operatingCarrierRegion" {...register("operatingCarrierRegion")}>
                <option value="auto">Work it out from the airline code</option>
                <option value="eu">An EU, EEA or Swiss airline</option>
                <option value="uk">A UK airline</option>
                <option value="other">Another airline</option>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">Operating airline.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="icao24">Aircraft transponder (ICAO24, optional)</Label>
              <Input id="icao24" placeholder="e.g. 400f00" className="font-mono" aria-invalid={!!e.icao24} {...register("icao24")} />
              <FieldError message={e.icao24?.message} />
              <p className="text-xs text-muted-foreground">Only if tracking is wrong.</p>
            </div>
          </CardContent>
        )}
      </Card>

      {serverError && <Alert tone="danger" title={serverError} />}

      <Card>
        <CardFooter className="justify-between border-0">
          <p className="hidden text-xs text-muted-foreground sm:flex sm:items-center sm:gap-1.5">
            <Sparkles className="size-3.5" aria-hidden /> Live tracking starts 3 hours before departure.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {mode === "create" ? "Add trip" : "Save changes"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
