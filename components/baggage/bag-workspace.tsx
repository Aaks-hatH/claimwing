"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Camera, Images, ListChecks } from "lucide-react";
import type { MarkerView, PhotoView } from "@/lib/baggage";
import type { BagView, TripView } from "@/lib/dal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { CaptureWizard } from "./capture-wizard";
import { CompareView } from "./compare-view";
import { BagDetails } from "./bag-details";
import { cn } from "@/lib/utils";

type Mode = "before" | "after" | "compare" | "details";

export function BagWorkspace({
  trip,
  bag,
  photos: initialPhotos,
  markers: initialMarkers,
  aiEnabled,
}: {
  trip: TripView;
  bag: BagView;
  photos: PhotoView[];
  markers: MarkerView[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [photos, setPhotos] = useState(initialPhotos);
  const [markers, setMarkers] = useState(initialMarkers);
  const urlMode = sp.get("mode") === "capture" ? (sp.get("stage") === "after" ? "after" : "before") : (sp.get("mode") as Mode | null);
  const fallback: Mode = photos.some((p) => p.stage === "after") ? "compare" : photos.some((p) => p.stage === "before") ? "after" : "before";
  const mode: Mode = urlMode && ["before", "after", "compare", "details"].includes(urlMode) ? urlMode : fallback;
  const go = (m: Mode) => router.replace(`${pathname}?mode=${m}`, { scroll: false });

  const count = (stage: string) => photos.filter((p) => p.stage === stage).length;

  const before = count("before");
  const after = count("after");
  const pending = markers.filter((m) => !m.confirmed && !m.dismissed).length;
  const confirmed = markers.filter((m) => m.confirmed).length;
  const damaged = bag.status === "arrived_damaged";
  const steps: Array<{ label: string; state: "done" | "todo" | "attention" | "na"; hint: string; mode: Mode }> = [
    { label: "Check-in photos", state: before ? "done" : "todo", hint: before ? `${before} taken` : "Before you hand the bag over", mode: "before" },
    { label: "Arrival photos", state: after ? "done" : damaged ? "attention" : "todo", hint: after ? `${after} taken` : "Same angles at the carousel", mode: "after" },
    { label: "Align and compare", state: before && after ? "done" : "na", hint: before && after ? "Use Differences to see what changed" : "Needs both sets of photos", mode: "compare" },
    { label: "Review findings", state: pending ? "attention" : confirmed ? "done" : before && after ? "todo" : "na", hint: pending ? `${pending} suggestion${pending === 1 ? "" : "s"} to confirm or dismiss` : confirmed ? `${confirmed} confirmed` : "Confirm what is damage", mode: "compare" },
    { label: "Report and export", state: bag.pirReference ? "done" : damaged ? "attention" : "na", hint: bag.pirReference ? `Report ${bag.pirReference}` : "Airline report and deadlines", mode: "details" },
  ];

  return (
    <>
    <nav aria-label="Baggage damage steps" className="mb-6 overflow-x-auto">
      <ol className="flex min-w-max gap-2">
        {steps.map((st, i) => (
          <li key={st.label}>
            <button
              type="button"
              onClick={() => go(st.mode)}
              className={cn(
                "flex w-44 flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition-colors hover:bg-secondary",
                st.mode === mode && "border-foreground",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <span className={cn("grid size-4 place-items-center rounded-full text-[10px]", st.state === "done" ? "bg-success text-white" : st.state === "attention" ? "bg-warning text-white" : "border text-muted-foreground")} aria-hidden>
                  {st.state === "done" ? "✓" : st.state === "attention" ? "!" : i + 1}
                </span>
                {st.label}
                <span className="sr-only">: {st.state === "done" ? "done" : st.state === "attention" ? "needs attention" : st.state === "na" ? "not available yet" : "to do"}</span>
              </span>
              <span className="text-[11px] leading-snug text-muted-foreground">{st.hint}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
    <Tabs value={mode} onValueChange={(v) => go(v as Mode)}>
      <TabsList aria-label="Bag sections">
        <TabsTrigger value="before">
          <Camera aria-hidden /> Before ({count("before")})
        </TabsTrigger>
        <TabsTrigger value="after">
          <Camera aria-hidden /> After ({count("after")})
        </TabsTrigger>
        <TabsTrigger value="compare">
          <Images aria-hidden /> Compare
        </TabsTrigger>
        <TabsTrigger value="details">
          <ListChecks aria-hidden /> Status and deadlines
        </TabsTrigger>
      </TabsList>
      <TabsContent value="before">
        <div className="mx-auto max-w-2xl">
          <CaptureWizard
            bagId={bag.id}
            stage="before"
            photos={photos}
            onUploaded={(p) => setPhotos((ps) => [...ps.filter((x) => !(x.stage === p.stage && x.angle === p.angle)), p])}
            onFinish={() => {
              router.refresh();
              go("details");
            }}
          />
        </div>
      </TabsContent>
      <TabsContent value="after">
        <div className="mx-auto max-w-2xl">
          {count("before") === 0 && (
            <Card className="mb-4">
              <CardContent className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">No before photos were taken. After photos still record the condition on arrival.</p>
                <Button size="sm" variant="outline" onClick={() => go("before")}>
                  Take before photos
                </Button>
              </CardContent>
            </Card>
          )}
          <CaptureWizard
            bagId={bag.id}
            stage="after"
            photos={photos}
            onUploaded={(p) => setPhotos((ps) => [...ps.filter((x) => !(x.stage === p.stage && x.angle === p.angle)), p])}
            onFinish={() => {
              router.refresh();
              go("compare");
            }}
          />
        </div>
      </TabsContent>
      <TabsContent value="compare">
        <CompareView bagId={bag.id} photos={photos} markers={markers} setPhotos={setPhotos} setMarkers={setMarkers} aiEnabled={aiEnabled} />
      </TabsContent>
      <TabsContent value="details">
        <BagDetails trip={trip} bag={bag} />
      </TabsContent>
    </Tabs>
    </>
  );
}
