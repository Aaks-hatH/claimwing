"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Download, Lightbulb, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label, NativeSelect } from "@/components/ui/primitives";
import { ConfirmDialog, Switch } from "@/components/ui/overlays";

type Prefs = { units: "metric" | "imperial"; timeFormat: "24h" | "12h"; notifyDelays: boolean; notifyDeadlines: boolean; homeCurrency: string; sdrRate: number };

export function SettingsForm({ user }: { user: { name: string; email: string; preferences: Prefs & { communityReports: boolean } } }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(user.name);
  const [p, setP] = useState<Prefs>(user.preferences);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sharing, setSharing] = useState(user.preferences.communityReports);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [deleteReportsOpen, setDeleteReportsOpen] = useState(false);

  async function toggleSharing(on: boolean) {
    setSharingBusy(true);
    const prev = sharing;
    setSharing(on);
    const res = await fetch("/api/ripple/sharing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) }).catch(() => null);
    setSharingBusy(false);
    if (!res?.ok) {
      setSharing(prev);
      return void toast.error("Couldn't change sharing. Check your connection and try again.");
    }
    toast.success(on ? "Sharing is on. Your reports are visible to others on the same flight." : "Sharing is off. Your past reports are no longer shown to anyone.");
  }

  async function guidance(body: object, done: string) {
    const res = await fetch("/api/account/guidance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) return void toast.error("Couldn't save. Try again.");
    toast.success(done);
    router.refresh();
  }

  async function save() {
    setBusy(true);
    const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, preferences: p }) });
    setBusy(false);
    if (!res.ok) return void toast.error("Couldn't save settings");
    toast.success("Settings saved");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="units">Units</Label>
            <NativeSelect id="units" value={p.units} onChange={(e) => setP({ ...p, units: e.target.value as Prefs["units"] })}>
              <option value="metric">Metric (km, m)</option>
              <option value="imperial">Imperial (mi, ft, knots)</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="theme">Appearance</Label>
            <NativeSelect id="theme" value={theme ?? "system"} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Home currency</Label>
            <NativeSelect id="currency" value={p.homeCurrency} onChange={(e) => setP({ ...p, homeCurrency: e.target.value })}>
              {["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "INR", "AED", "JPY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sdr">Value of 1 SDR in your currency</Label>
            <Input id="sdr" inputMode="decimal" value={p.sdrRate} onChange={(e) => setP({ ...p, sdrRate: Number(e.target.value) || 0 })} />
            <p className="text-xs text-muted-foreground">
              Used to convert the baggage liability limit (stated in Special Drawing Rights). Check the current rate at{" "}
              <a className="underline" href="https://www.imf.org/external/np/fin/data/rms_sdrv.aspx" target="_blank" rel="noreferrer">
                imf.org
              </a>
              .
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
            <span>
              <span className="block font-medium">Delay alerts</span>
              <span className="text-muted-foreground">When a tracked flight is expected 2 h 30 min or more late.</span>
            </span>
            <Switch checked={p.notifyDelays} onCheckedChange={(v) => setP({ ...p, notifyDelays: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
            <span>
              <span className="block font-medium">Deadline reminders</span>
              <span className="text-muted-foreground">3 days and 1 day before baggage claim deadlines.</span>
            </span>
            <Switch checked={p.notifyDeadlines} onCheckedChange={(v) => setP({ ...p, notifyDeadlines: v })} />
          </label>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={save} loading={busy}>
            Save settings
          </Button>
        </CardFooter>
      </Card>

      <Card id="community">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-signal" aria-hidden /> Community observations
          </CardTitle>
          <CardDescription>
            In Flight Ripple you can report what you see at the airport, like boarding starting or a delay announcement. Others on the same flight see a summary that never includes your name, email or booking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              <span className="block font-medium">Share my observations</span>
              <span className="text-muted-foreground">Turning this off also hides every report you already shared.</span>
            </span>
            <Switch checked={sharing} disabled={sharingBusy} onCheckedChange={(v) => void toggleSharing(v)} aria-label="Share my observations" />
          </label>
          <Button variant="outline" onClick={() => setDeleteReportsOpen(true)}>
            <Trash2 /> Delete all my observations
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-signal" aria-hidden /> Help and tips
          </CardTitle>
          <CardDescription>Bring back the welcome tour or tips you dismissed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            onClick={async () => {
              await guidance({ onboarding: "reset" }, "The welcome tour will open now.");
              router.push("/app/welcome");
            }}
          >
            <RotateCcw /> Restart the welcome tour
          </Button>
          <Button variant="outline" onClick={() => void guidance({ resetHints: true }, "Tips will show again.")}>
            <Lightbulb /> Show dismissed tips
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteReportsOpen}
        onOpenChange={setDeleteReportsOpen}
        title="Delete all your observations?"
        description="This permanently removes every report you've shared about any flight. Forecasts for those flights will no longer use them. It can't be undone."
        confirmLabel="Delete observations"
        destructive
        onConfirm={async () => {
          const res = await fetch("/api/ripple/reports", { method: "DELETE" }).catch(() => null);
          const b = res ? await res.json().catch(() => ({})) : {};
          if (!res?.ok) return void toast.error(b.error ?? "Couldn't delete your observations. Try again.");
          toast.success(b.deleted ? `Deleted ${b.deleted} observation${b.deleted === 1 ? "" : "s"}.` : "You had no observations to delete.");
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>Download everything we store about you, or delete it all.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" asChild>
            <a href="/api/account/export">
              <Download /> Export my data
            </a>
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete my account and photos
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => (setDeleteOpen(o), setConfirmText(""))}
        title="Delete your account?"
        description="This permanently deletes your trips, flight evidence, photos, receipts and claims. It can't be undone. Export your data first if you might need it."
        confirmLabel="Delete everything"
        destructive
        onConfirm={async () => {
          const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: confirmText }) });
          const b = await res.json().catch(() => ({}));
          if (!res.ok) return void toast.error(b.error ?? "Couldn't delete the account");
          toast.success("Your account was deleted");
          await signOut({ callbackUrl: "/" });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="confirmEmail">Type {user.email} to confirm</Label>
          <Input id="confirmEmail" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </div>
      </ConfirmDialog>
    </div>
  );
}
