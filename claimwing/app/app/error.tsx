"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { CloudOff } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={CloudOff}
      title="Something went wrong loading this page"
      description={
        <>
          Your data is safe. This is usually a brief connection problem with the database.
          {error.digest && <span className="mt-2 block font-mono text-[11px]">Reference: {error.digest}</span>}
        </>
      }
      action={
        <Button onClick={reset} variant="outline">
          <RefreshCw /> Try again
        </Button>
      }
    />
  );
}
