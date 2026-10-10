"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuidance } from "@/components/help/guidance";
import { cn } from "@/lib/utils";

/** Invites people who haven't seen the welcome tour. Never blocks the app; "No thanks" hides it for good. */
export function TourCard({ className }: { className?: string }) {
  const g = useGuidance();
  const show = g && !g.onboardingDone;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          className={cn("flex flex-col gap-4 overflow-hidden rounded-3xl border border-signal/25 bg-info-soft/60 p-5 sm:flex-row sm:items-center sm:justify-between", className)}
          aria-label="Welcome tour"
        >
          <div className="flex gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-signal" aria-hidden />
            <div>
              <p className="font-medium">New here? Take the 2-minute tour</p>
              <p className="mt-1 text-sm text-muted-foreground">Add a flight.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={() => void g.setOnboarding("skipped").catch(() => undefined)}>
              No thanks
            </Button>
            <Button asChild size="sm">
              <Link href="/app/welcome">Start the tour</Link>
            </Button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
