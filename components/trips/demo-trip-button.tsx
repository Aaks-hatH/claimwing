"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Creates a "Demo replay" trip that replays a delayed flight in a few minutes. */
export function DemoTripButton({ variant = "secondary", size, enabled = true }: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; enabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  return (
    <Button
      variant={variant}
      size={size}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo: true }) });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Couldn't start the demo");
          toast.success("Demo replay started. The flight plays about 90× faster than real time.");
          router.push(`/app/trips/${body.trip.id}?tab=flight`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't start the demo");
          setBusy(false);
        }
      }}
    >
      {!busy && <PlayCircle />} Demo replay
    </Button>
  );
}
