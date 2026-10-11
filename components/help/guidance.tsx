"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * First-run guidance state. Signed-in users keep it on their account (so a dismissed hint stays
 * dismissed on every device); signed-out visitors fall back to this browser's storage.
 */
type Guidance = {
  signedIn: boolean;
  onboardingDone: boolean;
  dismissed: Set<string>;
  dismiss: (id: string) => void;
  resetHints: () => Promise<void>;
  setOnboarding: (s: "completed" | "skipped" | "reset") => Promise<void>;
};

const Ctx = createContext<Guidance | null>(null);
const LOCAL_KEY = "vola.guidance";

function readLocal(): { dismissed: string[]; onboarding?: string } {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "{}");
  } catch {
    return { dismissed: [] };
  }
}
function writeLocal(v: { dismissed: string[]; onboarding?: string }) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(v));
  } catch {
    /* storage can be unavailable; guidance simply isn't remembered */
  }
}

async function patch(body: object) {
  const res = await fetch("/api/account/guidance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("Couldn't save");
}

export function GuidanceProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial: { signedIn: boolean; onboardingDone: boolean; dismissedHints: string[] };
}) {
  const [dismissed, setDismissed] = useState(() => new Set(initial.dismissedHints));
  const [onboardingDone, setDone] = useState(initial.onboardingDone);

  useEffect(() => {
    if (initial.signedIn) return;
    const l = readLocal();
    // Merging the visitor's saved choices after hydration; nothing renders differently on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(new Set(l.dismissed ?? []));
    if (l.onboarding) setDone(true);
  }, [initial.signedIn]);

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        const next = new Set(prev).add(id);
        if (!initial.signedIn) writeLocal({ ...readLocal(), dismissed: [...next] });
        return next;
      });
      if (initial.signedIn) patch({ dismissHint: id }).catch(() => undefined);
    },
    [initial.signedIn],
  );
  const resetHints = useCallback(async () => {
    setDismissed(new Set());
    if (initial.signedIn) await patch({ resetHints: true });
    else writeLocal({ ...readLocal(), dismissed: [] });
  }, [initial.signedIn]);
  const setOnboarding = useCallback(
    async (s: "completed" | "skipped" | "reset") => {
      setDone(s !== "reset");
      if (initial.signedIn) await patch({ onboarding: s });
      else writeLocal({ ...readLocal(), onboarding: s === "reset" ? undefined : s });
    },
    [initial.signedIn],
  );

  const value = useMemo(
    () => ({ signedIn: initial.signedIn, onboardingDone, dismissed, dismiss, resetHints, setOnboarding }),
    [initial.signedIn, onboardingDone, dismissed, dismiss, resetHints, setOnboarding],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuidance() {
  return useContext(Ctx);
}

/** A dismissible tip. Once dismissed it doesn't come back (account-wide when signed in). */
export function Hint({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  const g = useGuidance();
  const show = g ? !g.dismissed.has(id) : true;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.aside
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
          transition={{ duration: 0.24 }}
          className={cn("flex gap-3 overflow-hidden rounded-2xl border border-signal/25 bg-info-soft/60 p-4 text-sm", className)}
          aria-label={`Tip: ${title}`}
        >
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{title}</p>
            <div className="mt-1 leading-relaxed text-muted-foreground">{children}</div>
          </div>
          {g && (
            <button
              type="button"
              onClick={() => g.dismiss(id)}
              className="-m-1 h-fit rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              aria-label={`Dismiss tip: ${title}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
