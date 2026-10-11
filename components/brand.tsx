import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mark: a swept "V" wing on a blue squircle. The wordmark is set in the display grotesque, lowercase. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("logo-mark size-8 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="10" fill="var(--signal)" />
      <path d="M7.5 9.5 14.2 22.4c.7 1.3 2.4 1.3 3.1 0L26 7" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="7" r="1.6" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} aria-label="Vola home" className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[23px] font-bold leading-none tracking-[-0.04em]" style={{ fontStretch: "90%" }}>
        vola
      </span>
    </Link>
  );
}
