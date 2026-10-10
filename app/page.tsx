import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ArrivalsBoard } from "@/components/landing/arrivals-board";
import { BagCompare } from "@/components/landing/bag-compare";
import { auth } from "@/lib/auth";
import { ArrowUpRight, Plane, Radio } from "lucide-react";

const TIMELINE = [
  {
    when: "Before you fly",
    title: "Add the flight and photograph your bag",
    body: "We start following the flight three hours before departure. A guided camera takes seven angles of your bag at check-in.",
  },
  {
    when: "While it's late",
    title: "See what the airline owes you now",
    body: "Once you're expected 2 h 30 min late, you see your rights to meals, calls, a hotel or rerouting while you're still at the gate.",
  },
  {
    when: "After landing",
    title: "Export one evidence packet",
    body: "Every recorded time with its source, your photos side by side, the rule that applies, and a claim letter drafted only from what you recorded.",
  },
];

const PACKET: [string, string][] = [
  ["Scheduled arrival", "07:05"],
  ["Gate arrival", "10:44, schedule service"],
  ["Arrival delay", "3 h 39 min"],
  ["Distance", "5,540 km"],
  ["Rule", "UK261, Article 7(1)(c)"],
  ["Estimate", "£260 to £520"],
  ["Bag photos", "7 at check-in, 7 at the carousel"],
];

const RULES = [
  {
    name: "EU261",
    covers: "Flights leaving the EU, EEA or Switzerland on any airline, and flights into them on an EU airline.",
    get: "€250, €400 or €600 when you arrive 3 hours or more late, depending on distance.",
  },
  {
    name: "UK261",
    covers: "Flights leaving the UK, and flights into the UK on a UK or EU airline.",
    get: "£220, £350 or £520 on the same terms.",
  },
  {
    name: "US DOT",
    covers: "Flights within, to or from the United States.",
    get: "A refund if the flight is cancelled or significantly changed and you choose not to fly. US law sets no cash payment for delays.",
  },
  {
    name: "Montreal Convention",
    covers: "Checked bags on international flights.",
    get: "Up to 1,519 SDR for a damaged, delayed or lost bag. Report damage within 7 days and a delayed bag within 21.",
  },
];

const QUESTIONS = [
  ["Is this legal advice?", "No. ClaimWing helps you collect and organise facts. Eligibility results are automated estimates; an airline, regulator or court may decide differently."],
  ["Does ClaimWing contact the airline for me?", "No. You download the packet and send it yourself, so you decide what is shared. We don't take a cut of any compensation."],
  ["Where does the flight data come from?", "Scheduled and actual times from a flight schedule service, positions broadcast by the aircraft itself (ADS-B, via airplanes.live and the OpenSky Network), and anything you enter. Every time shows its source."],
  ["What can the photos prove?", "That the bag was in one condition at check-in and another at arrival. They don't prove who caused the damage, and the packet says so."],
];

export default async function Landing() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const startHref = signedIn ? "/app/trips/new" : "/signup";

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 md:px-8">
          <Logo />
          <nav className="flex items-center gap-1.5" aria-label="Account">
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
                  <Link href="/signup">Create account</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Intro: pale sky, one serif headline, plenty of air. */}
        <section className="landing-hero relative -mt-20 overflow-hidden">
          <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-36 md:px-8 md:pb-32 md:pt-44">
            <div className="grid gap-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-end">
              <div>
                <p className="hero-kicker" data-rise style={{ "--rise-delay": "0ms" } as React.CSSProperties}>Flight evidence, in real time</p>
                <h1 className="hero-title mt-8" data-rise style={{ "--rise-delay": "120ms" } as React.CSSProperties}>
                  Build your claim <em>while the flight is still in the air.</em>
                </h1>
                <p className="mt-8 max-w-[46ch] text-[15px] leading-8 text-muted-foreground md:text-base" data-rise style={{ "--rise-delay": "260ms" } as React.CSSProperties}>
                  ClaimWing follows your flight live, records when it really landed, photographs your bag before and after, and
                  puts it all in one evidence packet for the airline. Free, and documentation, not legal advice.
                </p>
                <div className="mt-10 flex flex-wrap gap-3" data-rise style={{ "--rise-delay": "380ms" } as React.CSSProperties}>
                  <Button asChild variant="signal" size="lg">
                    <Link href={startHref}>Find your flight <ArrowUpRight size={17} aria-hidden /></Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a href="#board">Try the evidence engine</a>
                  </Button>
                </div>
                <p className="mt-6 text-xs text-muted-foreground">No cut of your claim. You choose what to send.</p>
              </div>

              <div className="hero-spotlight" aria-label="Live flight tracking visual" data-rise style={{ "--rise-delay": "300ms" } as React.CSSProperties}>
                <div className="hero-spotlight-line" aria-hidden />
                <Plane className="hero-spotlight-plane size-8" aria-hidden />
                <div className="hero-spotlight-meta">
                  <strong><Radio size={13} aria-hidden /> Flight record active</strong>
                  <span>ADS-B · live</span>
                </div>
                <p className="relative z-10 mt-4 font-display text-3xl font-normal leading-tight tracking-tight">A clearer picture<br />from gate to claim.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive rules engine */}
        <section id="board" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 md:px-8 md:pb-32">
          <div className="landing-board-caption"><span>Try the evidence engine</span><span>Choose a flight · move the delay · see the rule</span></div>
          <ArrivalsBoard />
        </section>

        {/* Bags */}
        <section id="bags" className="scroll-mt-20 bg-secondary/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-24 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16 md:px-8 md:py-32">
            <div className="md:pt-4">
              <h2 className="text-4xl leading-[1.02] stretch-display md:text-5xl">
                Same bag, same angles, two photos apart.
              </h2>
              <p className="mt-6 max-w-[52ch] leading-relaxed text-muted-foreground">
                At check-in, a guided camera takes seven angles. At the carousel, it overlays the first photo so the second
                one lines up. Originals are kept untouched with their capture times and SHA-256 hashes.
              </p>
              <p className="mt-4 max-w-[52ch] leading-relaxed text-muted-foreground">
                You mark the damage. AI can suggest marks too, and they stay unconfirmed until you accept them.
              </p>
              <p className="mt-8 border-l border-signal pl-4 text-sm leading-relaxed">
                Drag the blue handle across the photo. Under the Montreal Convention you have 7 days to report damage, so
                ClaimWing counts them down for you.
              </p>
            </div>
            <BagCompare />
          </div>
        </section>

        {/* The sequence of a trip, and what comes out of it. */}
        <section className="mx-auto overflow-x-clip max-w-6xl px-4 py-24 md:px-8 md:py-32">
          <h2 className="max-w-[20ch] text-4xl leading-[1.02] stretch-display md:text-5xl">
            One trip, three moments, one packet.
          </h2>
          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
            <ol className="relative space-y-10 border-l border-border pl-8">
              {TIMELINE.map((step, i) => (
                <li key={step.when} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[46px] top-0 flex size-7 items-center justify-center rounded-full border-2 border-background bg-signal text-xs font-semibold text-signal-foreground"
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium text-muted-foreground">{step.when}</p>
                  <h3 className="mt-1 text-2xl font-normal tracking-tight">{step.title}</h3>
                  <p className="mt-2 max-w-[56ch] leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>

            {/* A page of the packet, as it prints. */}
            <figure className="relative mx-auto w-full max-w-md lg:mx-0">
              <div aria-hidden className="absolute inset-0 translate-x-3 translate-y-3 rotate-2 rounded-2xl border bg-sky/60" />
              <div className="relative rounded-2xl border bg-card p-6 sm:p-8">
                <div className="flex items-center justify-between border-b pb-4">
                  <span className="text-xs font-medium text-muted-foreground">Claim evidence packet, page 1 of 6</span>
                  <span className="rounded bg-sky px-2 py-0.5 text-[11px] font-medium text-signal">Sample</span>
                </div>
                <p className="mt-5 text-2xl leading-tight stretch-semi">
                  BA178, New York JFK to London Heathrow
                </p>
                <dl className="mt-5 divide-y text-sm">
                  {PACKET.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                  Automated estimate from the facts recorded. Not legal advice.
                </p>
              </div>
            </figure>
          </div>
        </section>

        {/* Rules */}
        <section className="bg-secondary/60">
          <div className="mx-auto max-w-6xl px-4 py-24 md:px-8 md:py-32">
            <h2 className="max-w-[20ch] text-4xl leading-[1.02] stretch-display md:text-5xl">
              The rules we check, in plain terms.
            </h2>
            <p className="mt-5 max-w-[60ch] leading-relaxed text-muted-foreground">
              Close calls, like a delay within 15 minutes of the 3-hour line or a cause the airline may call extraordinary,
              are marked as needing a closer look rather than guessed.
            </p>
            <div className="mt-10">
              <table className="block w-full border-collapse text-left text-[15px] md:table">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b border-foreground/30 text-sm">
                    <th scope="col" className="w-[11rem] py-3 pr-6 font-semibold">Rule</th>
                    <th scope="col" className="py-3 pr-6 font-semibold">Covers</th>
                    <th scope="col" className="py-3 font-semibold">What you can get</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group">
                  {RULES.map((r) => (
                    <tr key={r.name} className="block border-b py-4 align-top md:table-row md:py-0">
                      <th scope="row" className="block pb-1 text-lg md:table-cell md:py-4 md:pr-6 stretch-semi">
                        {r.name}
                      </th>
                      <td className="block pb-2 leading-relaxed text-muted-foreground md:table-cell md:py-4 md:pr-6">{r.covers}</td>
                      <td className="block leading-relaxed md:table-cell md:py-4">{r.get}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Questions */}
        <section className="mx-auto max-w-6xl px-4 py-24 md:px-8 md:py-32">
          <h2 className="text-4xl leading-[1.02] stretch-display md:text-5xl">Questions</h2>
          <dl className="mt-10 divide-y border-y">
            {QUESTIONS.map(([q, a]) => (
              <div key={q} className="grid gap-2 py-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
                <dt className="text-lg font-semibold tracking-tight">{q}</dt>
                <dd className="max-w-[62ch] leading-relaxed text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Close */}
        <section className="bg-gradient-to-br from-[#1d6bff] via-[#0b3fc4] to-[#0a2f96] text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-20 md:flex-row md:items-end md:justify-between md:px-8 md:py-24">
            <h2 className="max-w-[18ch] text-4xl leading-[1.02] stretch-display text-white md:text-6xl">
              Flying soon? Add the flight before anything goes wrong.
            </h2>
            <Button asChild size="lg" className="self-start bg-white text-[#0b3fc4] hover:bg-white/90 md:self-auto">
              <Link href={startHref}>Add your flight</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <p className="max-w-[80ch]">
          ClaimWing is a documentation tool and does not provide legal advice. Flight positions from airplanes.live and the
          OpenSky Network; weather from Open-Meteo. Board flights above are examples.
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
