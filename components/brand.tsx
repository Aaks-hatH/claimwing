import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mark: a paper-plane glyph in a blue roundel. Wordmark is set in the display serif. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-7 shrink-0", className)} aria-hidden>
      <circle cx="12" cy="12" r="12" fill="var(--signal)" />
      <path d="M5.2 11.3 18.6 5.6c.7-.3 1.4.4 1.1 1.1l-5.7 13.4c-.3.7-1.3.7-1.6 0l-1.7-4.6-4.6-1.7c-.7-.3-.7-1.3 0-1.5Z" fill="#fff" />
      <path d="m10.6 14.2 4.4-4.4" stroke="var(--signal)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 text-[19px] tracking-tight stretch-semi", className)}>
      <LogoMark />
      <span>ClaimWing</span>
    </Link>
  );
}
