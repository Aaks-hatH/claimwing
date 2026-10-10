"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, MapPin, RefreshCw, ShieldAlert, SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import type { PhotoView } from "@/lib/baggage";
import { ANGLE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Label, Progress } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/overlays";
import { Silhouette } from "./silhouette";
import { cn } from "@/lib/utils";

const ANGLES = ["front", "back", "left", "right", "top", "bottom", "tag", "scale"] as const;
const OPTIONAL = new Set(["scale"]);
const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 10);

type Geo = { lat: number; lon: number; accuracy: number } | null;

function getPosition(): Promise<Geo> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

/**
 * Mobile-first guided capture. Uses the live camera (getUserMedia) when available, with a
 * framing guide and, at baggage claim, the matching "before" photo as a translucent overlay.
 * Falls back to the phone's own camera app via <input type="file" capture>.
 */
export function CaptureWizard({
  bagId,
  stage,
  photos,
  onUploaded,
  onFinish,
}: {
  bagId: string;
  stage: "before" | "after";
  photos: PhotoView[];
  onUploaded: (p: PhotoView) => void;
  onFinish: () => void;
}) {
  const mine = (a: string) => photos.find((p) => p.stage === stage && p.angle === a);
  const before = (a: string) => photos.find((p) => p.stage === "before" && p.angle === a);
  const firstMissing = ANGLES.findIndex((a) => !mine(a) && !OPTIONAL.has(a));
  const [step, setStep] = useState(firstMissing === -1 ? 0 : firstMissing);
  const angle = ANGLES[step];
  const [useLive, setUseLive] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [overlay, setOverlay] = useState(0.35);
  const [withGps, setWithGps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = ANGLES.filter((a) => mine(a)).length;
  const required = ANGLES.filter((a) => !OPTIONAL.has(a)).length;
  const requiredDone = ANGLES.filter((a) => !OPTIONAL.has(a) && mine(a)).length;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!useLive) {
      stop();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stop();
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => undefined);
        }
        setCamError(null);
      } catch {
        setCamError("Camera access was blocked or isn't available. Use \"Take photo\" instead.");
        setUseLive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useLive, facing, stop]);

  useEffect(() => stop, [stop]);

  async function upload(blob: Blob, name: string) {
    if (blob.size > MAX_MB * 1024 * 1024) {
      toast.error(`That photo is over ${MAX_MB} MB. Use a lower camera resolution.`);
      return;
    }
    setBusy(true);
    try {
      const geo = withGps ? await getPosition() : null;
      const fd = new FormData();
      fd.set("file", blob, name);
      fd.set("kind", "photo");
      fd.set("baggageId", bagId);
      fd.set("stage", stage);
      fd.set("angle", angle);
      fd.set("takenAt", new Date().toISOString());
      if (geo) {
        fd.set("lat", String(geo.lat));
        fd.set("lon", String(geo.lon));
        fd.set("accuracy", String(geo.accuracy));
      }
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      onUploaded(body.photo);
      const next = ANGLES.findIndex((a, i) => i > step && !mine(a) && a !== angle);
      if (next !== -1) setStep(next);
      else toast.success(`${stage === "before" ? "Before" : "After"} photos saved.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (blob) await upload(blob, `${stage}-${angle}.jpg`);
  }

  const current = mine(angle);
  const ref = stage === "after" ? before(angle) : undefined;
  const info = ANGLE_LABELS[angle];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {stage === "before" ? "Before (at check-in)" : "After (at baggage claim)"} · {requiredDone} of {required} required
          </p>
          <Progress value={(done / ANGLES.length) * 100} className="mt-2" aria-label="Capture progress" />
        </div>
        <Button variant="outline" size="sm" onClick={onFinish}>
          Done
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Photo angles">
        {ANGLES.map((a, i) => (
          <button
            key={a}
            role="tab"
            aria-selected={i === step}
            onClick={() => setStep(i)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
              i === step ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {mine(a) ? <Check className="size-3 text-success" aria-label="done" /> : null}
            {ANGLE_LABELS[a].label}
            {OPTIONAL.has(a) ? " (optional)" : ""}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="relative aspect-[3/4] w-full bg-black sm:aspect-[4/3]">
          {useLive ? (
            <>
              <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
              {ref && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ref.url} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" style={{ opacity: overlay }} />
              )}
              <Silhouette angle={angle} className="pointer-events-none absolute inset-0 size-full opacity-80" />
            </>
          ) : current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.url} alt={`${info.label}, ${stage} photo`} className="absolute inset-0 size-full object-contain" />
          ) : ref ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ref.url} alt={`${info.label}, before photo for reference`} className="absolute inset-0 size-full object-contain opacity-60" />
              <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">Before photo, for reference</span>
            </>
          ) : (
            <Silhouette angle={angle} className="absolute inset-0 size-full opacity-70" />
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              <Loader2 className="size-6 animate-spin" aria-label="Uploading" />
            </div>
          )}
          {current && !useLive && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-success px-2 py-1 text-xs font-medium text-white">
              <Check className="size-3.5" aria-hidden /> Saved
            </span>
          )}
        </div>
        <CardContent className="space-y-4 pt-4">
          <div>
            <p className="font-medium">{info.label}</p>
            <p className="text-sm text-muted-foreground">{info.hint}</p>
          </div>
          {angle === "tag" && (
            <Alert tone="warning" icon={ShieldAlert} title="Bag tags and labels can show your name and address">
              Originals are kept unchanged as evidence. You can blur this photo on exported copies from the Compare tab.
            </Alert>
          )}
          {camError && <Alert tone="warning" title={camError} />}

          {useLive && ref && (
            <div className="flex items-center gap-3">
              <Label htmlFor="overlay" className="shrink-0 text-xs">
                Before overlay
              </Label>
              <input id="overlay" type="range" min={0} max={0.8} step={0.05} value={overlay} onChange={(e) => setOverlay(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {useLive ? (
              <>
                <Button size="lg" onClick={snap} loading={busy} className="flex-1 sm:flex-none">
                  {!busy && <Camera />} Capture
                </Button>
                <Button size="lg" variant="outline" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} aria-label="Switch camera">
                  <SwitchCamera />
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setUseLive(false)} aria-label="Close camera">
                  <X />
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" onClick={() => fileRef.current?.click()} loading={busy} className="flex-1 sm:flex-none">
                  {!busy && (current ? <RefreshCw /> : <ImagePlus />)} {current ? "Retake" : "Take photo"}
                </Button>
                <Button size="lg" variant="outline" onClick={() => setUseLive(true)}>
                  <Camera /> Live camera{ref ? " with overlay" : ""}
                </Button>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              className="sr-only"
              aria-label={`Photo of the ${info.label.toLowerCase()}`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f, f.name);
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={withGps} onCheckedChange={setWithGps} aria-label="Save location with photos" />
              <MapPin className="size-4 text-muted-foreground" aria-hidden /> Save location
            </label>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label="Previous angle">
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setStep((s) => Math.min(ANGLES.length - 1, s + 1))} disabled={step === ANGLES.length - 1} aria-label="Next angle">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
