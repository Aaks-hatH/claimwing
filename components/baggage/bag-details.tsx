"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarClock, FileUp, PackageCheck, PackageX, PackageSearch, Paperclip, Trash2, TriangleAlert, Truck } from "lucide-react";
import { toast } from "sonner";
import type { BagView, TripView } from "@/lib/dal";
import { CONTENTS_LABELS, formatBytes } from "@/lib/format";
import { daysUntil, formatLocal } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label, NativeSelect, Textarea } from "@/components/ui/primitives";
import { Alert, NotLegalAdvice } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

const toInput = (iso: string | null, tz: string | null) => (iso ? DateTime.fromISO(iso).setZone(tz ?? "UTC").toFormat("yyyy-LL-dd'T'HH:mm") : "");
const fromInput = (v: string, tz: string | null) => (v ? DateTime.fromISO(v, { zone: tz ?? "UTC" }).toUTC().toISO() : null);

export function BagDetails({ trip, bag }: { trip: TripView; bag: BagView }) {
  const router = useRouter();
  const tz = trip.destination.tz;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const receiptRef = useRef<HTMLInputElement>(null);

  async function patch(body: Record<string, unknown>, label = "save") {
    setBusy(label);
    try {
      const res = await fetch(`/api/baggage/${bag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Couldn't save");
      toast.success("Saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  async function uploadReceipt(file: File) {
    setBusy("receipt");
    try {
      const fd = new FormData();
      fd.set("file", file, file.name);
      fd.set("kind", "receipt");
      fd.set("baggageId", bag.id);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Upload failed");
      toast.success("Receipt attached");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  const deadlines = bag.eligibility?.deadlines ?? [];
  const now = new Date();

  const statusButtons = [
    { status: "received_ok", label: "Arrived OK", icon: PackageCheck, body: { status: "received_ok", receivedAt: new Date().toISOString() } },
    { status: "arrived_damaged", label: "Arrived damaged", icon: TriangleAlert, body: { status: "arrived_damaged", receivedAt: bag.receivedAt ?? new Date().toISOString() } },
    { status: "delayed", label: "Didn't arrive", icon: PackageSearch, body: { status: "delayed", reportedMissingAt: bag.reportedMissingAt ?? new Date().toISOString() } },
    { status: "lost", label: "Lost", icon: PackageX, body: { status: "lost" } },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>What happened to this bag?</CardTitle>
            <CardDescription>Tap one at baggage claim. It starts the legal deadline countdown.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {statusButtons.map((s) => (
              <button
                key={s.status}
                onClick={() => patch(s.body, s.status)}
                disabled={busy !== null}
                aria-pressed={bag.status === s.status}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60",
                  bag.status === s.status && "border-primary bg-accent text-accent-foreground",
                )}
              >
                <s.icon className="size-5" aria-hidden />
                {s.label}
              </button>
            ))}
          </CardContent>
          {bag.status === "delayed" && !bag.deliveredAt && (
            <CardFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted-foreground">When the airline delivers it, mark it here. The 21-day claim deadline starts on delivery.</p>
              <Button variant="outline" size="sm" onClick={() => patch({ deliveredAt: new Date().toISOString() }, "delivered")} loading={busy === "delivered"}>
                <Truck /> Delivered now
              </Button>
            </CardFooter>
          )}
        </Card>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const val = String(f.get("value") ?? "").trim();
            patch({
              description: String(f.get("description") ?? "").trim() || bag.description,
              tagNumber: String(f.get("tag") ?? "").trim() || null,
              pirReference: String(f.get("pir") ?? "").trim() || null,
              contentsCategory: f.get("contents"),
              estimatedValue: val ? { amount: Number(val), currency: String(f.get("currency")) } : null,
              receivedAt: fromInput(String(f.get("receivedAt") ?? ""), tz),
              reportedMissingAt: fromInput(String(f.get("reportedMissingAt") ?? ""), tz),
              deliveredAt: fromInput(String(f.get("deliveredAt") ?? ""), tz),
              notes: String(f.get("notes") ?? "").trim() || null,
            });
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Times are local to {trip.destination.iata}.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" defaultValue={bag.description} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tag">Bag tag number</Label>
                <Input id="tag" name="tag" defaultValue={bag.tagNumber ?? ""} maxLength={20} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pir">Property Irregularity Report (PIR) reference</Label>
                <Input id="pir" name="pir" defaultValue={bag.pirReference ?? ""} maxLength={40} placeholder="e.g. JFKBA12345" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contents">Contents</Label>
                <NativeSelect id="contents" name="contents" defaultValue={bag.contentsCategory}>
                  {Object.entries(CONTENTS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value">Estimated value</Label>
                <div className="flex gap-2">
                  <Input id="value" name="value" inputMode="decimal" defaultValue={bag.estimatedValue?.amount ?? ""} />
                  <NativeSelect name="currency" className="w-24" aria-label="Currency" defaultValue={bag.estimatedValue?.currency ?? "USD"}>
                    {["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "INR"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receivedAt">Received at</Label>
                <Input id="receivedAt" name="receivedAt" type="datetime-local" defaultValue={toInput(bag.receivedAt, tz)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reportedMissingAt">Reported missing at</Label>
                <Input id="reportedMissingAt" name="reportedMissingAt" type="datetime-local" defaultValue={toInput(bag.reportedMissingAt, tz)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deliveredAt">Delivered at (delayed bags)</Label>
                <Input id="deliveredAt" name="deliveredAt" type="datetime-local" defaultValue={toInput(bag.deliveredAt, tz)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={3} defaultValue={bag.notes ?? ""} maxLength={2000} />
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <Button type="button" variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete bag
              </Button>
              <Button type="submit" loading={busy === "save"}>
                Save details
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>

      <div className="space-y-6">
        <Card className={cn(deadlines.some((d) => d.hard && d.kind !== "limitation" && daysUntil(d.dueAt) <= 3 && daysUntil(d.dueAt) > 0) && "border-warning/50")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deadlines.length === 0 && <p className="text-sm text-muted-foreground">Mark what happened to the bag to start the countdown.</p>}
            {deadlines.map((d) => {
              const days = daysUntil(d.dueAt, now);
              const past = days < 0;
              return (
                <div key={d.kind} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{d.label}</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", past ? "text-danger" : days <= 3 && d.kind !== "limitation" ? "text-warning" : "")}>
                    {past ? "Passed" : days < 1 ? `${Math.max(1, Math.round(days * 24))} h left` : `${Math.floor(days)} days left`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    By {formatLocal(d.dueAt, tz)} · {d.basis}
                  </p>
                </div>
              );
            })}
            {bag.eligibility?.overLimit && (
              <Alert tone="warning" title="Value above the liability limit">
                Airlines are generally liable up to about {bag.eligibility.limitLocal?.toLocaleString("en")} {bag.eligibility.limitCurrency} ({bag.eligibility.limitSdr.toLocaleString("en")} SDR) unless you declared a higher value at check-in.
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">We&apos;ll remind you 3 days and 1 day before each deadline.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="size-4 text-muted-foreground" aria-hidden /> Receipts
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => receiptRef.current?.click()} loading={busy === "receipt"}>
              {busy !== "receipt" && <FileUp />} Add
            </Button>
            <input
              ref={receiptRef}
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              aria-label="Attach a receipt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadReceipt(f);
              }}
            />
          </CardHeader>
          <CardContent>
            {bag.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Repair quotes, replacement items, and essentials you bought while the bag was delayed.</p>
            ) : (
              <ul className="space-y-2">
                {bag.receipts.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <a href={`/api/uploads/${r.key}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline-offset-4 hover:underline">
                      {r.filename}
                    </a>
                    <span className="text-xs text-muted-foreground">{formatBytes(r.size)}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${r.filename}`}
                      onClick={async () => {
                        const res = await fetch(`/api/uploads/${r.key}`, { method: "DELETE" });
                        if (res.ok) router.refresh();
                        else toast.error("Couldn't remove the receipt");
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <NotLegalAdvice />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this bag?"
        description="Its photos, damage markers and receipts will be permanently deleted."
        confirmLabel="Delete bag"
        destructive
        onConfirm={async () => {
          const res = await fetch(`/api/baggage/${bag.id}`, { method: "DELETE" });
          if (!res.ok) return void toast.error("Couldn't delete the bag");
          router.push(`/app/trips/${trip.id}?tab=baggage`);
          router.refresh();
        }}
      />
    </div>
  );
}
