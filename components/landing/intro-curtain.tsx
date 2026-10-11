"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { setIntroDone } from "./intro";

const KEY = "vola-intro-seen";

/** SkyWindow's opening: the mark draws itself, then two bands part. Plays once per tab session. */
export function IntroCurtain() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"show" | "open" | "gone">("show");

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* storage can be blocked; just play the intro */
    }
    if (reduce || seen) {
      const skip = window.setTimeout(() => {
        setPhase("gone");
        setIntroDone();
      }, 0);
      return () => window.clearTimeout(skip);
    }
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const open = window.setTimeout(() => {
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
      root.style.overflow = prev;
      setPhase("open");
      setIntroDone();
    }, 2000);
    const gone = window.setTimeout(() => setPhase("gone"), 3400);
    return () => {
      window.clearTimeout(open);
      window.clearTimeout(gone);
      root.style.overflow = prev;
    };
  }, [reduce]);

  if (phase === "gone") return null;
  return (
    <>
      <noscript>
        <style>{".sw-curtain{display:none!important}"}</style>
      </noscript>
      <div className="sw-curtain" data-open={phase === "open"} role="dialog" aria-modal="true" aria-labelledby="sw-curtain-title">
        <div className="sw-curtain-band top" aria-hidden />
        <div className="sw-curtain-band bottom" aria-hidden />
        <div className="sw-curtain-inner">
          <svg className="sw-mark" viewBox="0 0 32 32" aria-hidden>
            <rect x="2" y="2" width="28" height="28" />
            <path d="M7.5 9.5 14.2 22.4c.7 1.3 2.4 1.3 3.1 0L26 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p id="sw-curtain-title" className="sw-wordmark">
            vola
          </p>
          <p className="sw-curtain-q">Was your flight late enough to claim?</p>
          <div className="sw-curtain-progress" aria-hidden>
            <span />
          </div>
          <p className="sw-curtain-what">Loading EU261, UK261, US DOT and Montreal</p>
        </div>
      </div>
    </>
  );
}
