"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CornerDownLeft, FileText, FlaskConical, Home, LifeBuoy, Moon, Plane, Plus, Search, Settings, Sparkles, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { id: string; label: string; hint?: string; icon: typeof Home; group: "Go to" | "Actions" | "Your trips"; run: () => void; keywords?: string };
type TripItem = { id: string; flightNumber: string; flightDate: string; origin: { iata: string }; destination: { iata: string } };

/** Ctrl+K / Cmd+K quick switcher for pages, trips and common actions. */
export function CommandPalette({ onHelp }: { onHelp: () => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [trips, setTrips] = useState<TripItem[] | null>(null);
  const [tripError, setTripError] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("vola:command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("vola:command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open || trips) return;
    fetch("/api/trips")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: { items: Array<{ trip: TripItem } | TripItem> }) => setTrips(b.items.map((x) => ("trip" in x ? x.trip : x))))
      .catch(() => setTripError(true));
  }, [open, trips]);

  const go = useCallback(
    (href: string) => () => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      { id: "home", label: "Home", icon: Home, group: "Go to", run: go("/app"), keywords: "dashboard" },
      { id: "trips", label: "Trips", icon: Plane, group: "Go to", run: go("/app/trips"), keywords: "flights" },
      { id: "claims", label: "Claims", icon: FileText, group: "Go to", run: go("/app/claims") },
      { id: "settings", label: "Settings", icon: Settings, group: "Go to", run: go("/app/settings"), keywords: "preferences sharing data" },
      { id: "demo", label: "Demo Center", hint: "Simulated scenarios", icon: FlaskConical, group: "Go to", run: go("/demo"), keywords: "simulation ripple cascade" },
      { id: "new", label: "Add a trip", icon: Plus, group: "Actions", run: go("/app/trips/new"), keywords: "track flight new" },
      { id: "tour", label: "Take the welcome tour", icon: Sparkles, group: "Actions", run: go("/app/welcome"), keywords: "onboarding help" },
      { id: "help", label: "Help for this page", icon: LifeBuoy, group: "Actions", run: () => (setOpen(false), onHelp()), keywords: "explain" },
      {
        id: "theme",
        label: resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        group: "Actions",
        run: () => (setOpen(false), setTheme(resolvedTheme === "dark" ? "light" : "dark")),
      },
    ];
    const tripItems: Item[] = (trips ?? []).slice(0, 30).map((t) => ({
      id: `trip-${t.id}`,
      label: `${t.flightNumber} ${t.origin.iata} to ${t.destination.iata}`,
      hint: t.flightDate,
      icon: Plane,
      group: "Your trips",
      run: go(`/app/trips/${t.id}`),
      keywords: `${t.flightNumber} ${t.origin.iata} ${t.destination.iata} ${t.flightDate}`,
    }));
    const all = [...base, ...tripItems];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((i) => `${i.label} ${i.hint ?? ""} ${i.keywords ?? ""}`.toLowerCase().includes(s));
  }, [trips, q, go, onHelp, resolvedTheme, setTheme]);

  useEffect(() => {
    // Keep the highlighted row valid when the list changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(0);
  }, [q, open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  }

  let lastGroup = "";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (setOpen(o), o || setQ(""))}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border bg-popover shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search Vola</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search pages, trips and actions"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-list"
              aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
            />
          </div>
          <ul id="cmd-list" ref={listRef} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
            {items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <li key={item.id} role="presentation">
                  {header && <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{header}</p>}
                  <div
                    id={`cmd-${item.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={item.run}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm", i === active && "bg-secondary")}
                  >
                    <item.icon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
                    {i === active && <CornerDownLeft className="size-3.5 text-muted-foreground" aria-hidden />}
                  </div>
                </li>
              );
            })}
            {!items.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches &ldquo;{q}&rdquo;.</li>}
            {tripError && <li className="px-3 py-2 text-xs text-muted-foreground">Your trips couldn&apos;t be loaded, so only pages and actions are shown.</li>}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
