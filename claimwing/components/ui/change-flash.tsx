"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Briefly highlights its content when `value` changes after the first render, so a status or time
 * that just updated catches the eye. The text itself is the source of truth; the highlight only
 * marks that a real value changed. Screen readers get a polite announcement instead.
 */
export function ChangeFlash({ value, children, className, announce }: { value: unknown; children: React.ReactNode; className?: string; announce?: string }) {
  const first = useRef(true);
  const prev = useRef(value);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      prev.current = value;
      return;
    }
    if (JSON.stringify(prev.current) !== JSON.stringify(value)) {
      prev.current = value;
      // A real value changed: restart the highlight.
      setFlash((n) => n + 1);
    }
  }, [value]);
  return (
    <span key={flash} className={cn("inline-flex rounded-md", flash > 0 && "change-flash", className)}>
      {children}
      {flash > 0 && announce && (
        <span className="sr-only" role="status">
          {announce}
        </span>
      )}
    </span>
  );
}
