import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 24 24" className="size-6 text-primary" aria-hidden>
        <rect x="1" y="1" width="22" height="22" rx="6" className="fill-primary" />
        <path d="M5 14.5 17.5 7.5c.9-.5 2 .1 1.9 1.1l-.1.4-9.3 6.6-3.6 3.1-.9-.6 1.6-3.3L5 14.5Z" fill="white" />
      </svg>
      <span>ClaimWing</span>
    </Link>
  );
}
