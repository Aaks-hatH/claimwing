import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Escape a user string for use inside a RegExp. */
export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isObjectId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
