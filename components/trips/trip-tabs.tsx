"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Briefcase, FileText, LayoutList, Plane } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutList },
  { id: "flight", label: "Flight", icon: Plane },
  { id: "baggage", label: "Baggage", icon: Briefcase },
  { id: "claim", label: "Claim", icon: FileText },
] as const;

export type TabId = (typeof TABS)[number]["id"];

/** Tabs whose state lives in the URL (?tab=), so links, refreshes and the back button all work. */
export function TripTabs({ initial, panels }: { initial: TabId; panels: Record<TabId, React.ReactNode> }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const fromUrl = sp.get("tab");
  const tab = (TABS.some((t) => t.id === fromUrl) ? fromUrl : initial) as TabId;
  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}>
      <TabsList aria-label="Trip sections">
        {TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id}>
            <t.icon aria-hidden /> {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.id} value={t.id}>
          {panels[t.id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
