"use client";

import { useRef, useState } from "react";
import { Check, Columns2, EyeOff, Minus, MousePointerSquareDashed, Plus, RotateCcw, SplitSquareHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { MarkerView, PhotoView } from "@/lib/baggage";
import { ANGLE_LABELS } from "@/lib/format";
import { formatUtc } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";
import { Images } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };

export function CompareView({
  bagId,
  photos,
  markers,
  setPhotos,
  setMarkers,
  aiEnabled,
}: {
  bagId: string;
  photos: PhotoView[];
  markers: MarkerView[];
  setPhotos: (fn: (p: PhotoView[]) => PhotoView[]) => void;
  setMarkers: (fn: (m: MarkerView[]) => MarkerView[]) => void;
  aiEnabled: boolean;
}) {
  const angles = Object.keys(ANGLE_LABELS).filter((a) => photos.some((p) => p.angle === a));
  const pairs = angles.filter((a) => photos.some((p) => p.angle === a && p.stage === "before") && photos.some((p) => p.angle === a && p.stage === "after"));
  const [angle, setAngle] = useState(pairs[0] ?? angles[0] ?? "front");

  if (!angles.length) {
    return <EmptyState icon={Images} title="No photos yet" description="Take before photos at check-in and after photos at baggage claim to compare them here." />;
  }

  const before = photos.find((p) => p.angle === angle && p.stage === "before");
  const after = photos.find((p) => p.angle === angle && p.stage === "after");

  return (
    <div className="space-y-4">
      <Alert tone="info" title="What these photos can and can't show">
        They show the bag&apos;s condition at check-in and at arrival, so damage that appears between them happened in between. They don&apos;t prove who caused it.
      </Alert>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Angles">
        {angles.map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={a === angle}
            onClick={() => setAngle(a)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
              a === angle ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {ANGLE_LABELS[a].label}
            {markers.some((m) => m.angle === a && m.confirmed) && <span className="size-1.5 rounded-full bg-danger" aria-label="has damage" />}
          </button>
        ))}
      </div>
      <PairView
        key={angle}
        bagId={bagId}
        angle={angle}
        before={before}
        after={after}
        markers={markers.filter((m) => m.angle === angle)}
        setMarkers={setMarkers}
        setPhotos={setPhotos}
        aiEnabled={aiEnabled}
      />
    </div>
  );
}

function PairView({
  bagId,
  angle,
  before,
  after,
  markers,
  setMarkers,
  setPhotos,
  aiEnabled,
}: {
  bagId: string;
  angle: string;
  before?: PhotoView;
  after?: PhotoView;
  markers: MarkerView[];
  setMarkers: (fn: (m: MarkerView[]) => MarkerView[]) => void;
  setPhotos: (fn: (p: PhotoView[]) => PhotoView[]) => void;
  aiEnabled: boolean;
}) {
  const [mode, setMode] = useState<"side" | "slider">(before && after ? "slider" : "side");
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [marking, setMarking] = useState(false);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [note, setNote] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const afterImg = useRef<HTMLImageElement>(null);

  const transform = { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" };

  function rel(e: React.PointerEvent) {
    const r = afterImg.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (marking && afterImg.current) {
      const p = rel(e);
      drawStart.current = p;
      setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    } else if (zoom > 1) {
      drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (drawStart.current && afterImg.current) {
      const p = rel(e);
      const s = drawStart.current;
      setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
    } else if (drag.current) {
      setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
    }
  }
  function onPointerUp() {
    drawStart.current = null;
    drag.current = null;
    setDraft((d) => (d && d.w > 0.01 && d.h > 0.01 ? d : null));
  }

  async function saveMarker() {
    if (!draft) return;
    const res = await fetch(`/api/baggage/${bagId}/markers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angle, rect: draft, note }),
    });
    const body = await res.json();
    if (!res.ok) return toast.error(body.error ?? "Couldn't save the marker");
    setMarkers((m) => [...m, body.marker]);
    setDraft(null);
    setNote("");
    setMarking(false);
    toast.success("Damage marked");
  }

  async function updateMarker(id: string, patch: Partial<MarkerView>) {
    const res = await fetch(`/api/baggage/${bagId}/markers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const body = await res.json();
    if (!res.ok) return toast.error(body.error ?? "Couldn't update");
    setMarkers((ms) => (patch.dismissed ? ms.filter((m) => m.id !== id) : ms.map((m) => (m.id === id ? body.marker : m))));
  }

  async function deleteMarker(id: string) {
    const res = await fetch(`/api/baggage/${bagId}/markers/${id}`, { method: "DELETE" });
    if (res.ok) setMarkers((ms) => ms.filter((m) => m.id !== id));
  }

  async function suggest() {
    setAiBusy(true);
    try {
      const res = await fetch("/api/vision-compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baggageId: bagId, angle }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "AI check failed");
      setMarkers((ms) => [...ms.filter((m) => !(m.angle === angle && m.source === "ai" && !m.confirmed)), ...body.markers]);
      toast.message(body.markers.length ? `${body.markers.length} possible difference${body.markers.length > 1 ? "s" : ""} suggested. Confirm or dismiss each one.` : body.note ?? "No clear differences found.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI check failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function toggleBlur(photo: PhotoView, blurred: boolean) {
    const res = await fetch(`/api/baggage/${bagId}/photos/${photo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blurred }) });
    const body = await res.json();
    if (!res.ok) return toast.error(body.error ?? "Couldn't update");
    setPhotos((ps) => ps.map((p) => (p.id === photo.id ? body.photo : p)));
  }

  const markerLayer = (
    <>
      {markers.map((m, i) => (
        <div
          key={m.id}
          className={cn("pointer-events-none absolute border-2", m.confirmed ? "border-danger" : "border-dashed border-warning")}
          style={{ left: `${m.rect.x * 100}%`, top: `${m.rect.y * 100}%`, width: `${m.rect.w * 100}%`, height: `${m.rect.h * 100}%` }}
        >
          <span className={cn("absolute -top-5 left-0 rounded px-1 text-[10px] font-semibold text-white", m.confirmed ? "bg-danger" : "bg-warning")}>{i + 1}</span>
        </div>
      ))}
      {draft && (
        <div
          className="pointer-events-none absolute border-2 border-primary bg-primary/10"
          style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
        />
      )}
    </>
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{ANGLE_LABELS[angle].label}</CardTitle>
        <div className="flex flex-wrap items-center gap-1">
          {before && after && (
            <div className="mr-1 flex rounded-lg border p-0.5" role="group" aria-label="View mode">
              <Button size="sm" variant={mode === "slider" ? "secondary" : "ghost"} onClick={() => (setMode("slider"), setMarking(false))} aria-pressed={mode === "slider"}>
                <SplitSquareHorizontal /> Slider
              </Button>
              <Button size="sm" variant={mode === "side" ? "secondary" : "ghost"} onClick={() => setMode("side")} aria-pressed={mode === "side"}>
                <Columns2 /> Side by side
              </Button>
            </div>
          )}
          <Button size="icon-sm" variant="outline" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out">
            <Minus />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums">{zoom.toFixed(1)}×</span>
          <Button size="icon-sm" variant="outline" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => (setZoom(1), setPan({ x: 0, y: 0 }))} aria-label="Reset zoom">
            <RotateCcw />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "slider" && before && after ? (
          <div className="space-y-2">
            <div
              className="relative overflow-hidden rounded-lg border bg-black touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <div style={transform} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={afterImg} src={after.url} alt="After photo" className="block w-full select-none" draggable={false} />
                {markerLayer}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={before.url}
                  alt="Before photo"
                  className="absolute inset-0 block size-full select-none object-cover"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                  draggable={false}
                />
              </div>
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }} />
              <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Before</span>
              <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">After</span>
            </div>
            <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="w-full accent-[var(--primary)]" aria-label="Before and after divider" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[before, after].map((p, i) => (
              <figure key={i} className="space-y-1.5">
                <figcaption className="text-xs font-medium text-muted-foreground">{i === 0 ? "Before (check-in)" : "After (arrival)"}</figcaption>
                {p ? (
                  <div
                    className={cn("relative overflow-hidden rounded-lg border bg-black touch-none", i === 1 && marking && "cursor-crosshair ring-2 ring-primary")}
                    onPointerDown={i === 1 ? onPointerDown : (e) => zoom > 1 && ((e.currentTarget as HTMLElement).setPointerCapture(e.pointerId), (drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }))}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                  >
                    <div style={transform} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img ref={i === 1 ? afterImg : undefined} src={p.url} alt={i === 0 ? "Before photo" : "After photo"} className="block w-full select-none" draggable={false} />
                      {i === 1 && markerLayer}
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Not taken yet</div>
                )}
                {p && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {formatUtc(p.takenAt)}
                      {p.gps ? ` · ${p.gps.lat.toFixed(3)}, ${p.gps.lon.toFixed(3)}` : ""}
                    </span>
                    <label className="inline-flex items-center gap-1.5">
                      <Switch checked={p.blurred} onCheckedChange={(v) => toggleBlur(p, v)} aria-label="Blur on exported copies" />
                      <EyeOff className="size-3" aria-hidden /> Blur on export
                    </label>
                  </div>
                )}
              </figure>
            ))}
          </div>
        )}

        {after && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={marking ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setMode("side");
                setMarking((m) => !m);
                setDraft(null);
              }}
            >
              <MousePointerSquareDashed /> {marking ? "Drag on the after photo…" : "Mark damage"}
            </Button>
            {aiEnabled && before && (
              <Button variant="outline" size="sm" onClick={suggest} loading={aiBusy}>
                {!aiBusy && <Sparkles />} Suggest differences (AI)
              </Button>
            )}
          </div>
        )}

        {draft && (
          <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the damage, e.g. cracked corner" maxLength={500} autoFocus />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveMarker}>
                Save marker
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {markers.length > 0 && (
          <ol className="space-y-2">
            {markers.map((m, i) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
                <span className={cn("flex size-5 items-center justify-center rounded text-[11px] font-semibold text-white", m.confirmed ? "bg-danger" : "bg-warning")}>{i + 1}</span>
                <span className="min-w-0 flex-1">{m.note || "Damage"}</span>
                {!m.confirmed ? (
                  <>
                    <Badge tone="warning">Suggested, not confirmed</Badge>
                    <Button size="sm" variant="outline" onClick={() => updateMarker(m.id, { confirmed: true })}>
                      <Check /> Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => updateMarker(m.id, { dismissed: true })}>
                      <X /> Dismiss
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge tone={m.source === "ai" ? "info" : "neutral"}>{m.source === "ai" ? "AI suggestion, confirmed by you" : "Marked by you"}</Badge>
                    <Button size="icon-sm" variant="ghost" onClick={() => deleteMarker(m.id)} aria-label="Delete marker">
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
