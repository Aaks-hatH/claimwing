"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Camera, ChevronRight, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { BagView, TripView } from "@/lib/dal";
import { CONTENTS_LABELS } from "@/lib/format";
import { daysUntil, formatLocal } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, NativeSelect } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { EmptyState, StatusBadge, type StatusKey } from "@/components/ui/feedback";

const STATUS_KEY: Record<string, StatusKey> = {
  documented: "documented",
  received_ok: "received_ok",
  arrived_damaged: "arrived_damaged",
  delayed: "bag_delayed",
  lost: "lost",
};

export function BaggageList({ trip, bags }: { trip: TripView; bags: BagView[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Photograph each checked bag from every side at check-in, then again at baggage claim. If anything is damaged, the side-by-side photos become your evidence.
        </p>
        <Button onClick={() => setOpen(true)}>
          <Plus /> Add bag
        </Button>
      </div>
      {bags.length === 0 ? (
        <EmptyState icon={Briefcase} title="No bags yet" description="Add each checked bag, then take the before photos before you hand it over." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {bags.map((b) => {
            const next = b.eligibility?.deadlines.filter((d) => d.kind !== "limitation" && new Date(d.dueAt) > new Date()).sort((x, y) => x.dueAt.localeCompare(y.dueAt))[0];
            return (
              <Link key={b.id} href={`/app/trips/${trip.id}/baggage/${b.id}`} className="group">
                <Card className="h-full transition-colors group-hover:bg-muted/40">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {CONTENTS_LABELS[b.contentsCategory]}
                          {b.tagNumber ? ` · Tag ${b.tagNumber}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={STATUS_KEY[b.status]} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Camera className="size-3.5" aria-hidden /> Before {b.beforeCount}/7
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Camera className="size-3.5" aria-hidden /> After {b.afterCount}/7
                      </span>
                      {b.markers > 0 && (
                        <span className="inline-flex items-center gap-1 text-danger">
                          <ShieldAlert className="size-3.5" aria-hidden /> {b.markers} damage
                        </span>
                      )}
                    </div>
                    {next && (
                      <p className="rounded-md bg-warning-soft px-2.5 py-1.5 text-xs">
                        {next.label} by {formatLocal(next.dueAt, trip.destination.tz, { withZone: false })} ({Math.max(0, Math.floor(daysUntil(next.dueAt)))} days)
                      </p>
                    )}
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Open <ChevronRight className="size-4" aria-hidden />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <AddBagDialog open={open} onOpenChange={setOpen} tripId={trip.id} />
    </div>
  );
}

function AddBagDialog({ open, onOpenChange, tripId }: { open: boolean; onOpenChange: (o: boolean) => void; tripId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const description = String(f.get("description") ?? "").trim();
    if (!description) {
      setError("Describe the bag, for example 'Black medium suitcase'.");
      return;
    }
    setBusy(true);
    setError(null);
    const value = String(f.get("value") ?? "").trim();
    const res = await fetch("/api/baggage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        description,
        tagNumber: String(f.get("tag") ?? "").trim() || null,
        contentsCategory: f.get("contents"),
        estimatedValue: value ? { amount: Number(value), currency: f.get("currency") } : null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't add the bag");
      return;
    }
    onOpenChange(false);
    toast.success("Bag added. Take the before photos now.");
    router.push(`/app/trips/${tripId}/baggage/${body.id}?mode=capture&stage=before`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a checked bag</DialogTitle>
          <DialogDescription>You can change these details later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="Black medium hard-shell suitcase" maxLength={200} autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tag">Bag tag number (optional)</Label>
              <Input id="tag" name="tag" placeholder="BA123456" maxLength={20} autoCapitalize="characters" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contents">Contents</Label>
              <NativeSelect id="contents" name="contents" defaultValue="mixed">
                {Object.entries(CONTENTS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="value">Estimated value of bag and contents (optional)</Label>
            <div className="flex gap-2">
              <Input id="value" name="value" inputMode="decimal" placeholder="0" />
              <NativeSelect name="currency" className="w-24" aria-label="Currency" defaultValue="USD">
                {["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "INR"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Add and take photos
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
