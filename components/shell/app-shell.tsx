"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { FileText, LayoutDashboard, LogOut, Monitor, Moon, Plane, Settings, Sun, Plus } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { NotificationBell } from "./notification-bell";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/trips", label: "Trips", icon: Plane },
  { href: "/app/claims", label: "Claims", icon: FileText },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
}

export function AppShell({ user, children }: { user: { name: string; email: string; image?: string | null }; children: React.ReactNode }) {
  const isActive = useActive();
  const { setTheme } = useTheme();
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-muted/30 md:flex">
        <div className="flex h-14 items-center px-5">
          <Logo href="/app" />
        </div>
        <div className="px-3 pb-3">
          <Button asChild className="w-full justify-start" size="sm">
            <Link href="/app/trips/new">
              <Plus /> New trip
            </Link>
          </Button>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-background text-foreground ring-1 ring-border",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="px-5 pb-4 text-[11px] leading-relaxed text-muted-foreground">
          Documentation support, not legal advice.
        </p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <div className="md:hidden">
            <Logo href="/app" />
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex size-8 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold"
                  aria-label="Account menu"
                >
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    initials
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <span className="block truncate font-medium text-foreground">{user.name}</span>
                  <span className="block truncate">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTheme("light")}>
                  <Sun /> Light
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("dark")}>
                  <Moon /> Dark
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("system")}>
                  <Monitor /> System
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/settings">
                    <Settings /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/" })}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">
          {children}
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        {[NAV[0], NAV[1], { href: "/app/trips/new", label: "New", icon: Plus }, NAV[2], NAV[3]].map((item) => {
          const active = isActive(item.href, "exact" in item ? item.exact : false);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground",
                active && "text-primary",
              )}
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
