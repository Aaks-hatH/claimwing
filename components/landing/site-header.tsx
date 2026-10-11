"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** The chapters of the home page, in order. Each id must be on a [data-theme] element in app/page.tsx. */
export const CHAPTERS = [
  { id: "top", name: "Start" },
  { id: "board", name: "Try it" },
  { id: "bags", name: "Bags" },
  { id: "trip", name: "Trip" },
  { id: "rules", name: "Rules" },
  { id: "questions", name: "Questions" },
  { id: "start", name: "Add flight" },
] as const;

function Mark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
      <rect x="2" y="2" width="28" height="28" />
      <path d="M7.5 9.5 14.2 22.4c.7 1.3 2.4 1.3 3.1 0L26 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * SkyWindow's top bar: transparent over the night chapters, off-white over the light ones,
 * with a rail that fills as you scroll and one tick per chapter.
 */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [tone, setTone] = useState<"dark" | "light">("dark");
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState(0);
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      setScrolled(y > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (fill.current) fill.current.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, y / max)) : 0})`;
      let idx = 0;
      let t: "dark" | "light" = "dark";
      CHAPTERS.forEach((c, i) => {
        const el = document.getElementById(c.id);
        if (!el) return;
        if (el.getBoundingClientRect().top <= 40) {
          idx = i;
          t = el.dataset.theme === "light" ? "light" : "dark";
        }
      });
      setActive(idx);
      setTone(t);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header className="sw-bar" data-tone={tone} data-scrolled={scrolled}>
      <Link href="/" className="sw-brand" aria-label="Vola home">
        <Mark />
        vola
      </Link>

      <nav className="sw-rail" aria-label="Chapters">
        <div className="sw-rail-track" aria-hidden>
          <span ref={fill} className="sw-rail-fill" />
        </div>
        <ol>
          {CHAPTERS.map((c, i) => (
            <li key={c.id}>
              <a href={`#${c.id}`} aria-label={c.name} aria-current={i === active ? "step" : undefined} />
            </li>
          ))}
        </ol>
        <span className="sw-rail-name" aria-live="polite">
          {CHAPTERS[active].name}
        </span>
      </nav>

      <div className="sw-bar-actions">
        <Link href="/demo" className="sw-btn sw-btn-ghost sm hide-sm">
          Demo
        </Link>
        {!signedIn && (
          <Link href="/login" className="sw-btn sw-btn-ghost sm hide-sm">
            Sign in
          </Link>
        )}
        <Link href={signedIn ? "/app" : "/signup"} className="sw-btn sw-btn-primary sm">
          {signedIn ? "Dashboard" : "Get started"} <ArrowUpRight aria-hidden />
        </Link>
      </div>
    </header>
  );
}
