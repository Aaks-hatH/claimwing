"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function MotionSystem() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = new Set<HTMLElement>();
    const main = document.querySelector<HTMLElement>("main");
    if (main?.closest(".app-layout")) {
      // Signed-in pages: reveal each top-level block, whether the page returns a wrapper or loose blocks.
      let kids = Array.from(main.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName !== "P");
      for (let depth = 0; depth < 4 && kids.length === 1 && kids[0].children.length > 1; depth++) {
        kids = Array.from(kids[0].children).filter((el): el is HTMLElement => el instanceof HTMLElement);
      }
      kids.forEach((el) => targets.add(el));
    } else {
      document.querySelectorAll<HTMLElement>("main > section, main > div, .auth-aside").forEach((el) => targets.add(el));
    }
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => targets.add(el));
    // Lists: each child rises in turn.
    const stagger = new Map<HTMLElement, number>();
    document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((list) => {
      Array.from(list.children).forEach((child, i) => {
        if (child instanceof HTMLElement) {
          targets.add(child);
          stagger.set(child, Math.min(i * 70, 420));
        }
      });
    });
    const elements = Array.from(targets);
    if (reduced || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("motion-visible"));
    } else {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("motion-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });
      elements.forEach((element, index) => {
        element.classList.add("motion-reveal");
        element.style.setProperty("--reveal-delay", `${stagger.get(element) ?? Math.min(index * 70, 280)}ms`);
        observer.observe(element);
      });
      requestAnimationFrame(() => root.classList.add("motion-enabled"));
      return () => {
        observer.disconnect();
        root.classList.remove("motion-enabled");
      };
    }

    root.classList.add("motion-enabled");
    return () => root.classList.remove("motion-enabled");
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    const updateProgress = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        document.documentElement.style.setProperty("--scroll-progress", String(progress));
      });
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [pathname]);

  return <div className="scroll-progress" aria-hidden="true" />;
}
