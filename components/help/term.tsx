"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";
import { GLOSSARY, type GlossaryKey } from "./glossary";

/** An aviation or legal term with a tap-to-explain definition. Works with keyboard and touch. */
export function Term({ id, children, className }: { id: GlossaryKey; children?: React.ReactNode; className?: string }) {
  const g = GLOSSARY[id];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "cursor-help rounded-sm underline decoration-dotted decoration-muted-foreground/60 underline-offset-[3px] transition-colors hover:decoration-signal focus-visible:decoration-signal",
            className,
          )}
          aria-label={`${typeof children === "string" ? children : g.term}: what does this mean?`}
        >
          {children ?? g.term}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" side="top">
        <p className="font-semibold">{g.term}</p>
        <p className="mt-1 leading-relaxed text-muted-foreground">{g.short}</p>
        {"more" in g && g.more ? <p className="mt-2 leading-relaxed text-muted-foreground">{g.more}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

/** "Why am I seeing this?" / "How does this work?": a small expandable explanation tied to real state. */
export function Explain({ label = "Why am I seeing this?", children, className, defaultOpen = false }: { label?: string; children: React.ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("text-sm", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground"
      >
        <HelpCircle className="size-3.5" aria-hidden />
        {label}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border bg-muted/40 p-3 leading-relaxed text-muted-foreground">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
