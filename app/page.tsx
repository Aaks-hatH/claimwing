import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { Eyebrow, PacketCard, Reveal, ScrollHeading, ScrollMarquee, ScrollTimeline } from "@/components/landing/scroll-motion";
import { ArrivalsBoard } from "@/components/landing/arrivals-board";
import { BagCompare } from "@/components/landing/bag-compare";
import { auth } from "@/lib/auth";

const TIMELINE = [
  { when: "Before", title: "Add flight. Photograph bag.", body: "" },
  { when: "During", title: "See your rights.", body: "" },
  { when: "After", title: "Export one packet.", body: "" },
];

const PACKET: [string, string][] = [
  ["Scheduled", "07:05"],
  ["Arrived", "10:44"],
  ["Delay", "3 h 39"],
  ["Distance", "5,540 km"],
  ["Rule", "UK261, Article 7(1)(c)"],
  ["Estimate", "£260 to £520"],
  ["Bag photos", "14"],
];

const RULES = [
  { name: "EU261", covers: "EU flights", get: "€250 to €600 at 3 h late" },
  { name: "UK261", covers: "UK flights", get: "£220 to £520 at 3 h late" },
  { name: "US DOT", covers: "US flights", get: "Refund if cancelled. No delay cash." },
  { name: "Montreal", covers: "Checked bags", get: "Up to 1,519 SDR" },
];

const QUESTIONS = [
  ["Legal advice?", "No. Estimates only."],
  ["Do you contact the airline?", "No. You send the packet."],
  ["Where is the data from?", "Schedules, ADS-B, and you. Each time shows its source."],
  ["What do photos prove?", "Bag condition at two times. Not the cause."],
];

export default async function Landing() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const startHref = signedIn ? "/app/trips/new" : "/signup";

  return (
    <div className="min-h-dvh">
      <SiteHeader signedIn={signedIn} />

      <main>
        <Hero startHref={startHref} />
        <ScrollMarquee items={["EU261", "UK261", "US DOT", "Montreal", "ADS-B", "SHA-256"]} />

        {/* Interactive rules engine */}
        <section id="board" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 md:px-8 md:pb-32">
          <Eyebrow n="01">Try it</Eyebrow>
          <ScrollHeading text="Pick a flight. *Move the delay.*" className="stretch-display mb-10 max-w-[16ch] text-5xl leading-[0.95] md:text-7xl" />
          <ArrivalsBoard />
        </section>

        {/* Bags */}
        <section id="bags" className="scroll-mt-20 bg-secondary/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-24 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16 md:px-8 md:py-32">
            <div className="md:pt-4">
              <Eyebrow n="02">Bags</Eyebrow>
              <ScrollHeading text="Same bag. *Two photos.*" className="stretch-display text-5xl leading-[0.95] md:text-7xl" />
            </div>
            <BagCompare />
          </div>
        </section>

        {/* The sequence of a trip, and what comes out of it. */}
        <section id="trip" className="mx-auto max-w-6xl scroll-mt-20 overflow-x-clip px-4 py-24 md:px-8 md:py-32">
          <Eyebrow n="03">Trip</Eyebrow>
          <ScrollHeading text="One trip. *One packet.*" className="stretch-display max-w-[14ch] text-5xl leading-[0.95] md:text-7xl" />
          <div className="mt-16 grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20">
            <ScrollTimeline steps={TIMELINE.map(({ when, title }) => ({ when, title }))} />
            <PacketCard title="BA178, New York JFK to London Heathrow" rows={PACKET} />
          </div>
        </section>

        {/* Rules */}
        <section id="rules" className="scroll-mt-20 bg-secondary/60">
          <div className="mx-auto max-w-6xl px-4 py-24 md:px-8 md:py-32">
            <Eyebrow n="04">Rules</Eyebrow>
            <ScrollHeading text="The rules. *Plainly.*" className="stretch-display max-w-[14ch] text-5xl leading-[0.95] md:text-7xl" />
            <div className="mt-10">
              <table className="block w-full border-collapse text-left text-[15px] md:table">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b border-foreground/30 text-sm">
                    <th scope="col" className="w-[11rem] py-3 pr-6 font-semibold">Rule</th>
                    <th scope="col" className="py-3 pr-6 font-semibold">Covers</th>
                    <th scope="col" className="py-3 font-semibold">You get</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group">
                  {RULES.map((r) => (
                    <tr key={r.name} className="block border-b py-4 align-top md:table-row md:py-0">
                      <th scope="row" className="block pb-1 text-2xl md:table-cell md:py-5 md:pr-6 stretch-semi">
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
          <Eyebrow n="05">Questions</Eyebrow>
          <ScrollHeading text="Straight *answers.*" className="stretch-display text-5xl leading-[0.95] md:text-7xl" />
          <dl className="mt-12 border-t">
            {QUESTIONS.map(([q, a], i) => (
              <Reveal key={q} delay={i * 0.06} className="grid gap-2 border-b py-7 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
                <dt className="stretch-semi text-2xl">{q}</dt>
                <dd className="max-w-[62ch] text-lg leading-relaxed text-muted-foreground">{a}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* Close */}
        <section className="bg-gradient-to-br from-[#1d6bff] via-[#0b3fc4] to-[#0a2f96] text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-20 md:flex-row md:items-end md:justify-between md:px-8 md:py-24">
            <ScrollHeading text="Flying soon? *Add it now.*" className="stretch-display max-w-[12ch] text-5xl leading-[0.95] text-white md:text-8xl" accentClassName="text-sky" />
            <Button asChild size="lg" className="self-start bg-white text-[#0b3fc4] hover:bg-white/90 md:self-auto">
              <Link href={startHref}>Add flight</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <p>Documentation tool, not legal advice.</p>
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
