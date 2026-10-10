import Link from "next/link";
import { ArrowRight, Camera, Clock, FileCheck2, FileText, MapPinned, Radar, Scale, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

const STEPS = [
  { icon: Radar, title: "Add your flight before you fly", body: "We follow it live from three hours before departure and record every time with its source: schedule data, aircraft position reports, or what you saw." },
  { icon: Camera, title: "Photograph your bag twice", body: "A guided camera takes the same seven angles at check-in and at baggage claim, with the first photo overlaid so the second lines up." },
  { icon: FileCheck2, title: "Export one evidence packet", body: "Eligibility under EU, UK and US rules, a claim letter built from your facts, and every photo and time in one PDF you send yourself." },
];

const FEATURES = [
  { icon: MapPinned, title: "Live tracking with receipts", body: "Map, altitude profile and a timeline where every timestamp names its source, because airlines dispute delay times." },
  { icon: Clock, title: "Delay alerts while you wait", body: "When your flight is expected 2 h 30 min late, see what the airline owes you right now: meals, calls, hotel, rerouting." },
  { icon: Scale, title: "Honest eligibility", body: "EU261, UK261, US DOT and the Montreal Convention as tested rules. Close calls are marked Needs review, never guessed." },
  { icon: Camera, title: "Before and after, side by side", body: "Slider comparison, zoom, and damage markers you draw. Optional AI suggestions stay unconfirmed until you accept them." },
  { icon: FileText, title: "Letters without invented facts", body: "Drafted only from what you recorded, with [placeholders] for anything missing. AI polish is checked so it can't change a number." },
  { icon: ShieldCheck, title: "Your data, your call", body: "Originals are kept untouched with SHA-256 hashes. Blur bag tags on exports. Export or delete everything any time." },
];

const FAQ = [
  ["Is this legal advice?", "No. ClaimWing helps you collect and organise facts. Eligibility results are automated estimates; an airline, regulator or court may decide differently."],
  ["Does ClaimWing contact the airline for me?", "No. You download the packet and send it yourself, so you stay in control of what is shared. We don't take a cut of any compensation."],
  ["Which flights are covered?", "We assess EU261 (EU, EEA and Switzerland), UK261, US Department of Transportation rules, and the Montreal Convention for baggage on international flights. Other countries' rules aren't assessed yet."],
  ["Where does the flight data come from?", "Scheduled and actual times from a flight schedule service when configured, aircraft positions broadcast by the plane (ADS-B, via airplanes.live and the OpenSky Network), and anything you enter. Every time shows its source."],
  ["What can the photos prove?", "That the bag was in one condition at check-in and another at arrival. They don't prove who caused the damage, and we say so in the packet."],
];

export default async function Landing() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-8">
          <Logo />
          <nav className="flex items-center gap-2">
            {signedIn ? (
              <Button asChild size="sm">
                <Link href="/app">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 md:px-8 md:pt-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" aria-hidden /> Live flight tracking · EU261 · UK261 · US DOT · Montreal Convention
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">The evidence you need when your flight or bag goes wrong.</h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground text-pretty">
              ClaimWing tracks your flight live, photographs your bag before and after, and turns it all into one evidence packet for your compensation claim. Every fact has a source.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={signedIn ? "/app/trips/new" : "/signup"}>
                  Add your next flight <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={signedIn ? "/app" : "/login"}>{signedIn ? "Dashboard" : "Sign in"}</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Free. Documentation support, not legal advice.</p>
          </div>
        </section>

        <section className="border-y bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3 md:px-8">
            {STEPS.map((s, i) => (
              <div key={s.title}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                  <s.icon className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <h2 className="font-semibold">{s.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Built for the moment airlines push back</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Airlines often dispute arrival times and deny baggage damage. ClaimWing records the facts as they happen.</p>
          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-background p-6">
                <f.icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-4 font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 md:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <div className="mt-6 divide-y rounded-lg border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 md:flex-row md:items-center md:px-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Flying soon? Add the flight now.</h2>
              <p className="mt-1 text-muted-foreground">It takes a minute, and the evidence starts collecting itself.</p>
            </div>
            <Button asChild size="lg">
              <Link href={signedIn ? "/app/trips/new" : "/signup"}>
                Get started <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <p>
          ClaimWing is a documentation tool and does not provide legal advice. Flight positions from airplanes.live and the OpenSky Network; weather from Open-Meteo.
        </p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
