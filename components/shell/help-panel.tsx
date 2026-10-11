"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { BookOpen, FlaskConical, Keyboard, Sparkles, X } from "lucide-react";
import { GLOSSARY } from "@/components/help/glossary";
import { Kbd } from "@/components/ui/primitives";

type Topic = { title: string; intro: string; points: Array<[string, string]>; links?: Array<{ href: string; label: string }> };

const TRIP_TABS: Record<string, Topic> = {
  overview: {
    title: "Trip overview",
    intro: "A summary of this flight and a checklist of what to do before, during and after it.",
    points: [
      ["The checklist", "Each item ticks itself off from real data: photos taken, arrival recorded, claim started. Tap an item to go where you can do it."],
      ["Eligibility", "Calculated from the recorded arrival time and the rules for your route. Forecasts never count."],
    ],
  },
  flight: {
    title: "Flight tab",
    intro: "Live position, recorded times and what the airline owes you while you wait.",
    points: [
      ["Recorded times", "Every time shows its source: schedule data, aircraft position reports (ADS-B) or what you entered. Gate arrival is the time that counts legally in the EU and UK."],
      ["Your rights now", "Meals, calls, hotels and rebooking depend on the delay and your route. The list updates as the delay grows."],
      ["If something is wrong", "Use 'Record what happened' to add the arrival time or the reason the airline gave. Your entry is labelled as yours."],
    ],
  },
  ripple: {
    title: "Flight Ripple",
    intro: "A forecast of how late you'll be, built from live data, the aircraft flying in before yours, and passenger reports.",
    points: [
      ["Observed, reported, predicted", "Observed means flight data recorded it. Reported means passengers said so. Predicted means Vola estimated it. Each item is labelled."],
      ["The incoming aircraft", "If the plane for your flight is late arriving, there may not be enough time to turn it around. Vola only links flights when a data provider names the same aircraft."],
      ["Percentages", "Shown only when the trained model covers your flight. Otherwise you see Likely, Possible or Unlikely, based on the live evidence."],
      ["Reporting", "Tell others what you see at the gate. They see a summary like '2 people, 4 min ago', never who you are."],
    ],
    links: [{ href: "/demo?s=cascade", label: "Watch a simulated cascade" }],
  },
  baggage: {
    title: "Baggage tab",
    intro: "Photograph each bag at check-in and again at the carousel, so any damage is documented.",
    points: [
      ["Before you fly", "Add a bag and take the guided photos. Originals are stored untouched with their timestamps and SHA-256 hashes."],
      ["If it arrives damaged", "Take the after photos, compare them, mark the damage, and report it to the airline within 7 days (Montreal Convention)."],
    ],
  },
  claim: {
    title: "Claim tab",
    intro: "Start a claim once the flight has arrived. Vola builds a letter and an evidence packet from what you recorded.",
    points: [
      ["Readiness", "The checklist shows what's missing and links to where you can add it."],
      ["Sending", "You send the packet yourself. Vola doesn't contact airlines or take a cut."],
    ],
  },
};

function topicFor(path: string, tab: string | null): Topic {
  if (/^\/app\/trips\/[^/]+\/baggage\//.test(path)) {
    return {
      title: "Bag evidence",
      intro: "Before and after photos of one bag, compared side by side.",
      points: [
        ["Comparing", "Use the slider, side by side, or Differences. Differences aligns the two photos in your browser and highlights areas that changed."],
        ["Suggestions", "Areas found by the comparison or by AI are suggestions until you confirm them. Only confirmed marks go into the evidence packet."],
        ["What photos prove", "They show the bag at two moments. They don't prove who caused the damage, and the packet says so."],
        ["Deadlines", "Report damage in writing within 7 days of receiving the bag, and a delayed bag within 21 days."],
      ],
      links: [{ href: "/demo?s=bag", label: "Try a simulated investigation" }],
    };
  }
  if (/^\/app\/trips\/new/.test(path)) {
    return {
      title: "Add a trip",
      intro: "Enter the flight number and date. Vola looks up the times, or you can enter them yourself.",
      points: [
        ["Which date?", "The local departure date shown on your boarding pass."],
        ["Why add it early?", "Tracking starts 3 hours before departure, and before-photos of your bag must be taken at check-in."],
      ],
    };
  }
  if (/^\/app\/trips\/[^/]+/.test(path)) return TRIP_TABS[tab ?? "overview"] ?? TRIP_TABS.overview;
  if (/^\/app\/trips/.test(path)) return { title: "Trips", intro: "Every flight you've added, newest first.", points: [["Filters", "Show upcoming, active, disrupted or completed flights, or search by flight number or airport."]] };
  if (/^\/app\/claims\/[^/]+/.test(path)) {
    return {
      title: "Claim",
      intro: "Your letter and evidence packet for one claim.",
      points: [
        ["Readiness", "Each missing item explains why it matters and links to where you can fix it."],
        ["Preview", "Open the PDF preview to check everything before you download or send it."],
        ["Placeholders", "Anything in [BRACKETS] is a fact Vola doesn't know. Fill it in before sending."],
      ],
    };
  }
  if (/^\/app\/claims/.test(path)) return { title: "Claims", intro: "Claims you've started and their status.", points: [["Status", "Mark a claim as sent, awaiting reply, paid or rejected so Vola can track it."]] };
  if (/^\/app\/settings/.test(path)) {
    return {
      title: "Settings",
      intro: "Your profile, preferences and data.",
      points: [
        ["Community observations", "Turn sharing off to stop contributing and hide every report you shared. You can also delete them."],
        ["Your data", "Export everything as JSON, or delete your account and all photos."],
      ],
    };
  }
  return {
    title: "Home",
    intro: "Your next flight, money you may be owed, and anything with a deadline.",
    points: [
      ["Flights", "Filter by upcoming, active, disrupted or completed. Disrupted means a recorded delay of 15 minutes or more, or a cancellation."],
      ["Worth claiming", "Flights where the recorded facts suggest compensation. Open one to start a claim."],
    ],
  };
}

const GUIDES = [
  { href: "/app/welcome", label: "Welcome tour and track a flight", icon: Sparkles },
  { href: "/demo", label: "Demo Center (simulated)", icon: FlaskConical },
];

export function HelpPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const path = usePathname();
  const sp = useSearchParams();
  const t = topicFor(path, sp.get("tab"));
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(26rem,100vw)] flex-col border-l bg-background shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right" aria-describedby="help-intro">
          <div className="flex items-start justify-between gap-3 border-b p-5">
            <div>
              <p className="text-xs text-muted-foreground">Help for this page</p>
              <DialogPrimitive.Title className="mt-1 font-display text-2xl">{t.title}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close help">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto p-5 text-sm">
            <p id="help-intro" className="leading-relaxed text-muted-foreground">
              {t.intro}
            </p>
            <dl className="space-y-4">
              {t.points.map(([q, a]) => (
                <div key={q}>
                  <dt className="font-medium">{q}</dt>
                  <dd className="mt-1 leading-relaxed text-muted-foreground">{a}</dd>
                </div>
              ))}
            </dl>
            {(t.links?.length || GUIDES.length) && (
              <div>
                <p className="font-medium">Guides</p>
                <ul className="mt-2 space-y-1.5">
                  {[...(t.links ?? []).map((l) => ({ ...l, icon: FlaskConical })), ...GUIDES].map((g) => (
                    <li key={g.href}>
                      <Link href={g.href} onClick={() => onOpenChange(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                        <g.icon className="size-4 text-signal" aria-hidden /> {g.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
                <BookOpen className="size-4 text-signal" aria-hidden /> Words you&apos;ll see
              </summary>
              <dl className="mt-3 space-y-3">
                {Object.values(GLOSSARY).map((g) => (
                  <div key={g.term}>
                    <dt className="font-medium">{g.term}</dt>
                    <dd className="mt-0.5 leading-relaxed text-muted-foreground">{g.short}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <div className="rounded-xl border p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Keyboard className="size-3.5" aria-hidden /> Shortcuts
              </p>
              <p className="mt-2">
                <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> or <Kbd>⌘</Kbd> <Kbd>K</Kbd> search pages, trips and actions
              </p>
              <p className="mt-1">
                <Kbd>?</Kbd> open this help
              </p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
