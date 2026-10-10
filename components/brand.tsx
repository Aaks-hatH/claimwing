import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: a wayfinding-yellow sign tile with the plane glyph, set in condensed Archivo. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="4" fill="var(--signal)" />
      <path d="M5 14.5 17.5 7.5c.9-.5 2 .1 1.9 1.1l-.1.4-9.3 6.6-3.6 3.1-.9-.6 1.6-3.3L5 14.5Z" fill="#1e252d" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 text-[17px] font-extrabold tracking-tight stretch-semi", className)}
    >
      <LogoMark />
      <span>ClaimWing</span>
    </Link>
  );
}
