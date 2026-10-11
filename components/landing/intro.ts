"use client";

import { useSyncExternalStore } from "react";

/** Tiny shared flag: the hero holds its entrance until the intro curtain starts to open. */
let done = false;
const subs = new Set<() => void>();

export function setIntroDone() {
  if (done) return;
  done = true;
  subs.forEach((f) => f());
}

export function useIntroDone() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => done,
    () => false,
  );
}
