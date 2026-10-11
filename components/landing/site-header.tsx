"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "#board", label: "Try it", id: "board" },
  { href: "#bags", label: "Bags", id: "bags" },
  { href: "#rules", label: "Rules", id: "rules" },
];

/** Starts as a bare bar over the sky, then condenses into a floating glass pill once you scroll. */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Light up the link for whichever section is crossing the middle of the screen.
  useEffect(() => {
    const ids = LINKS.flatMap((l) => (l.id ? [l.id] : []));
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
          else setActive((cur) => (cur === e.target.id ? null : cur));
        }),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const expanded = open;
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 sm:pt-4">
      <div
        className={cn(
          "w-full border transition-[max-width,background-color,box-shadow,border-color,padding,border-radius] duration-500 ease-[cubic-bezier(.2,.75,.25,1)]",
          expanded ? "rounded-3xl" : "rounded-full",
          scrolled || expanded ? "max-w-3xl border-border/80 bg-background/75 px-3 shadow-[0_18px_50px_-24px_rgba(10,30,74,0.35)] backdrop-blur-xl" : "max-w-6xl border-transparent bg-transparent px-1 md:px-4",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2">
          <Logo />

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Sections" onMouseLeave={() => setHover(null)}>
            {LINKS.map((l) => {
              const on = active === l.id;
              const inner = (
                <>
                  {hover === l.href && <motion.span layoutId="nav-hover" className="absolute inset-0 -z-10 rounded-full bg-secondary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  {l.label}
                  {on && <motion.span layoutId="nav-dot" className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-signal" />}
                </>
              );
              const cls = cn("relative z-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors", on || hover === l.href ? "text-foreground" : "text-muted-foreground");
              return l.href.startsWith("/") ? (
                <Link key={l.href} href={l.href} className={cls} onMouseEnter={() => setHover(l.href)}>
                  {inner}
                </Link>
              ) : (
                <a key={l.href} href={l.href} className={cls} onMouseEnter={() => setHover(l.href)}>
                  {inner}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            {signedIn ? (
              <Button asChild size="sm" variant="signal">
                <Link href="/app">
                  Dashboard <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" variant="signal">
                  <Link href="/signup">
                    Get started <ArrowUpRight aria-hidden />
                  </Link>
                </Button>
              </>
            )}
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary md:hidden">
              {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.75, 0.25, 1] }} className="overflow-hidden md:hidden" aria-label="Sections (mobile)">
              <ul className="space-y-1 pb-3 pt-1">
                {[...LINKS, ...(signedIn ? [] : [{ href: "/login", label: "Sign in" }])].map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} onClick={() => setOpen(false)} className="stretch-display flex items-center justify-between rounded-2xl px-4 py-3 text-2xl hover:bg-secondary">
                      {l.label} <ArrowUpRight className="size-4 text-signal" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
