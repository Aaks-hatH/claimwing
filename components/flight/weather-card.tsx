"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudSun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/feedback";

type Wx = { summary: string; severe: boolean; source: string; sourceUrl: string; airport: string } | null;
type Stored = { departure: Wx; arrival: Wx; fetchedAt: string } | null;

export function WeatherCard({ tripId, weather, canFetch }: { tripId: string; weather: Stored; canFetch: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Stored>(weather);

  async function fetchWx() {
    setBusy(true);
    try {
      const res = await fetch(`/api/flights/${tripId}/weather`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't fetch weather");
      setData(body.weather);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't fetch weather");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Weather context</CardTitle>
          
        </div>
        {canFetch && (
          <Button size="sm" variant="outline" onClick={fetchWx} loading={busy}>
            {!busy && <CloudSun />} {data ? "Refresh" : "Check weather"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!data && <p className="text-muted-foreground">Not checked yet.</p>}
        {data &&
          [data.departure, data.arrival].map(
            (w, i) =>
              w && (
                <div key={i} className="rounded-lg border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium">{w.airport}</span>
                    <Badge tone={w.severe ? "warning" : "success"}>{w.severe ? "Possibly disruptive" : "No severe weather"}</Badge>
                  </div>
                  <p className="text-muted-foreground">{w.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source:{" "}
                    <a href={w.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                      {w.source}
                    </a>
                    . Model data, not an official airport weather report.
                  </p>
                </div>
              ),
          )}
      </CardContent>
    </Card>
  );
}
