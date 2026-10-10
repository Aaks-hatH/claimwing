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

  return (
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
  );
}
