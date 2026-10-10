"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, CheckCheck, Plane, TriangleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Item = { id: string; type: string; title: string; message: string; href?: string | null; readAt?: string | null; createdAt: string };

const ICON: Record<string, typeof Bell> = { delay_alert: TriangleAlert, landed: Plane, deadline: CalendarClock };

export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((i) => !i.readAt).length;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) setItems((await res.json()).items);
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function markAll() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    load();
  }

  async function markOne(id: string) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, readAt: new Date().toISOString() } : x)));
  }

  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o && load())}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              Delay alerts and deadline reminders will appear here.
            </li>
          )}
          {items.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            const body = (
              <div className="flex gap-3 px-4 py-3">
                <Icon className={cn("mt-0.5 size-4 shrink-0", n.readAt ? "text-muted-foreground" : "text-primary")} aria-hidden />
                <div className="min-w-0">
                  <p className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</p>
                </div>
              </div>
            );
            return (
              <li key={n.id} className="border-b last:border-0 hover:bg-muted/50">
                {n.href ? (
                  <Link href={n.href} onClick={() => (markOne(n.id), setOpen(false))}>
                    {body}
                  </Link>
                ) : (
                  <button className="w-full text-left" onClick={() => markOne(n.id)}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
