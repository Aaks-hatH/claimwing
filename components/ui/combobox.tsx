"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "./primitives";
import { cn } from "@/lib/utils";
import { isAirlineCode } from "@/lib/flight-number";

export type ComboItem = { code: string; label: string; sub?: string; tz?: string | null };

/**
 * Accessible autocomplete (ARIA combobox pattern) backed by /api/reference.
 * The value is the code (IATA); the input shows what the user typed or the selected label.
 */
export function ReferenceCombobox({
  type,
  value,
  onChange,
  placeholder,
  id,
  invalid,
  initialLabel,
}: {
  type: "airport" | "airline";
  value: string;
  onChange: (code: string, item?: ComboItem) => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  initialLabel?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(initialLabel ?? value);
  const [items, setItems] = useState<ComboItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    if (q.length < 2) {
      ctrl.current?.abort();
      return;
    }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setLoading(true);
      try {
        const res = await fetch(`/api/reference?type=${type}&q=${encodeURIComponent(q)}`, { signal: c.signal });
        const body = await res.json();
        setItems(body.items ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [text, type]);

  function choose(item: ComboItem) {
    typed.current = false;
    setText(type === "airport" ? `${item.code} · ${item.label}` : `${item.code} · ${item.label}`);
    setOpen(false);
    onChange(item.code, item);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          typed.current = true;
          setText(e.target.value);
          const raw = e.target.value.trim().toUpperCase();
          // Typing an exact code works without picking from the list.
          if ((type === "airport" && /^[A-Z]{3}$/.test(raw)) || (type === "airline" && isAirlineCode(raw))) onChange(raw);
          else if (value) onChange("");
        }}
        onFocus={() => items.length && typed.current && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(items[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {loading && <Loader2 className="absolute right-2.5 top-2.5 size-4 animate-spin text-muted-foreground" aria-hidden />}
      {open && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-sm">
          {items.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>}
          {items.map((item, i) => (
            <li
              key={item.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => (e.preventDefault(), choose(item))}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm", i === active && "bg-muted")}
            >
              <span className="w-9 shrink-0 font-mono text-xs font-semibold">{item.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {item.sub && <span className="block truncate text-xs text-muted-foreground">{item.sub}</span>}
              </span>
              {value === item.code && <Check className="size-4 text-primary" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
