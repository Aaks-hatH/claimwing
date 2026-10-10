"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlays";

export function TripActions({ tripId, demo }: { tripId: string; demo: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Trip actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!demo && (
            <DropdownMenuItem asChild>
              <Link href={`/app/trips/${tripId}/edit`}>
                <Pencil /> Edit trip
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-danger" onSelect={() => setConfirm(true)}>
            <Trash2 /> Delete trip
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this trip?"
        description="This permanently deletes the flight evidence, baggage photos, receipts and claims for this trip. Export the claim PDF first if you still need it."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={async () => {
          const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
          if (!res.ok) {
            toast.error("Couldn't delete the trip");
            return;
          }
          toast.success("Trip deleted");
          router.push("/app/trips");
          router.refresh();
        }}
      />
    </>
  );
}
