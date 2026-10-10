const LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  sent: "Filed",
  awaiting_reply: "Awaiting reply",
  paid: "Paid",
  rejected: "Rejected",
};

/** Claims by status as thin bars. Plain markup, so it is crisp, accessible and needs no chart library. */
export function ClaimsChart({ data }: { data: Array<{ status: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-4" aria-label="Claims by status">
      {data.map((d) => (
        <li key={d.status} className="grid grid-cols-[7.5rem_1fr_1.5rem] items-center gap-3 text-sm">
          <span className={d.count ? "text-foreground" : "text-muted-foreground"}>{LABEL[d.status] ?? d.status}</span>
          <span className="h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span className="block h-full rounded-full bg-signal transition-[width] duration-700" style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">{d.count}</span>
        </li>
      ))}
    </ul>
  );
}
