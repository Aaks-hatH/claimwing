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
  { href: "/app", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/app/trips", label: "Trips", icon: Plane },
  { href: "/app/claims", label: "Claims", icon: FileText },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
}

/** A single quiet top bar: wordmark, four words, and your account. No sidebar, so the page can breathe. */
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
    <div className="app-layout min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-5xl items-center justify-between gap-4 px-5 md:px-8">
          <Logo href="/app" />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                    active && "bg-secondary font-medium text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <Button asChild variant="signal" size="sm" className="mr-1 hidden sm:inline-flex">
              <Link href="/app/trips/new">
                <Plus /> New trip
              </Link>
            </Button>
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex size-9 items-center justify-center overflow-hidden rounded-full bg-sky text-xs font-medium text-signal transition-colors hover:bg-secondary"
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
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl px-5 pb-32 pt-8 md:px-8 md:pb-24 md:pt-14">
        {children}
        <p className="mt-24 text-center text-[11px] text-muted-foreground">Documentation support, not legal advice.</p>
      </main>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-full border bg-background/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Main"
      >
        {[NAV[0], NAV[1], { href: "/app/trips/new", label: "New", icon: Plus }, NAV[2], NAV[3]].map((item) => {
          const active = isActive(item.href, "exact" in item ? item.exact : false);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex flex-col items-center gap-1 py-2.5 text-[10.5px] text-muted-foreground", active && "text-signal")}
            >
              <item.icon className="size-[18px]" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
