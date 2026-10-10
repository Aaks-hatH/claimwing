"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  sent: "Filed",
  awaiting_reply: "Awaiting",
  paid: "Paid",
  rejected: "Rejected",
};

export function ClaimsChart({ data }: { data: Array<{ status: string; count: number }> }) {
  const rows = data.map((d) => ({ name: LABEL[d.status] ?? d.status, count: d.count }));
  return (
    <div className="h-48" role="img" aria-label={rows.map((r) => `${r.name}: ${r.count}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="name" width={70} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
