"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function MotionSystem() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("main > section, main > div, .auth-aside"));
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
        element.style.setProperty("--reveal-delay", `${Math.min(index * 70, 280)}ms`);
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
