import "./skywindow.css";
import type { Viewport } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { IntroCurtain } from "@/components/landing/intro-curtain";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { Eyebrow, PacketCard, Reveal, ScrollHeading, ScrollMarquee, ScrollTimeline } from "@/components/landing/scroll-motion";
import { ArrivalsBoard } from "@/components/landing/arrivals-board";
import { BagCompare } from "@/components/landing/bag-compare";
import { auth } from "@/lib/auth";

export const viewport: Viewport = { themeColor: "#0b0d10", viewportFit: "cover", width: "device-width", initialScale: 1 };

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

  const h2 = "text-5xl leading-[1] md:text-7xl";
  const wrap = "mx-auto max-w-[90rem] px-[var(--sw-gutter)]";

  return (
    <div className="sw">
      <IntroCurtain />
      <SiteHeader signedIn={signedIn} />

      <main>
        {/* Chapter 1, night: the hero and the rule names sliding past */}
        <div id="top" data-theme="dark" className="sw-dark sw-chapter">
          <Hero startHref={startHref} />
          <ScrollMarquee items={["EU261", "UK261", "US DOT", "Montreal", "ADS-B", "SHA-256"]} />
        </div>

        {/* Chapter 2, paper: the interactive rules engine */}
        <section id="board" data-theme="light" className="sw-chapter scroll-mt-0 pb-24 pt-24 md:pb-32 md:pt-32">
          <div className={wrap}>
            <Eyebrow n="01">Try it</Eyebrow>
            <ScrollHeading text="Pick a flight. *Move the delay.*" className={`${h2} mb-10 max-w-[16ch]`} />
            <ArrivalsBoard />
          </div>
        </section>

        {/* Chapter 3, night: bags */}
        <section id="bags" data-theme="dark" className="sw-dark sw-chapter">
          <div className={`${wrap} grid gap-10 py-24 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16 md:py-32`}>
            <div className="md:pt-4">
              <Eyebrow n="02">Bags</Eyebrow>
              <ScrollHeading text="Same bag. *Two photos.*" className={h2} />
            </div>
            <BagCompare />
          </div>
        </section>

        {/* Chapter 4, paper: the sequence of a trip, and what comes out of it */}
        <section id="trip" data-theme="light" className="sw-chapter overflow-x-clip py-24 md:py-32">
          <div className={wrap}>
            <Eyebrow n="03">Trip</Eyebrow>
            <ScrollHeading text="One trip. *One packet.*" className={`${h2} max-w-[14ch]`} />
            <div className="mt-16 grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20">
              <ScrollTimeline steps={TIMELINE.map(({ when, title }) => ({ when, title }))} />
              <PacketCard title="BA178, New York JFK to London Heathrow" rows={PACKET} />
            </div>
          </div>
        </section>

        {/* Chapter 5, night: rules */}
        <section id="rules" data-theme="dark" className="sw-dark sw-chapter">
          <div className={`${wrap} py-24 md:py-32`}>
            <Eyebrow n="04">Rules</Eyebrow>
            <ScrollHeading text="The rules. *Plainly.*" className={`${h2} max-w-[14ch]`} />
            <div className="mt-10">
              <table className="block w-full border-collapse text-left text-[15px] md:table">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b-2 border-foreground/40 text-sm">
                    <th scope="col" className="w-[11rem] py-3 pr-6 font-semibold">Rule</th>
                    <th scope="col" className="py-3 pr-6 font-semibold">Covers</th>
                    <th scope="col" className="py-3 font-semibold">You get</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group">
                  {RULES.map((r) => (
                    <tr key={r.name} className="block border-b-2 py-4 align-top md:table-row md:py-0">
                      <th scope="row" className="stretch-semi block pb-1 text-2xl md:table-cell md:py-5 md:pr-6">
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

        {/* Chapter 6, paper: questions */}
        <section id="questions" data-theme="light" className="sw-chapter py-24 md:py-32">
          <div className={wrap}>
            <Eyebrow n="05">Questions</Eyebrow>
            <ScrollHeading text="Straight *answers.*" className={h2} />
            <dl className="mt-12 border-t-2">
              {QUESTIONS.map(([q, a], i) => (
                <Reveal key={q} delay={i * 0.06} className="grid gap-2 border-b-2 py-7 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
                  <dt className="stretch-semi text-2xl">{q}</dt>
                  <dd className="max-w-[62ch] text-lg leading-relaxed text-muted-foreground">{a}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* Chapter 7, night: the close, with the credits line */}
        <section id="start" data-theme="dark" className="sw-dark sw-chapter">
          <div className={`${wrap} flex min-h-[100svh] flex-col gap-10 pb-10 pt-24 md:pt-32`}>
            <div className="flex flex-1 flex-col justify-center gap-8 md:flex-row md:items-center md:justify-between">
              <ScrollHeading text="Flying soon? *Add it now.*" fillBy={0.62} className="max-w-[12ch] text-5xl leading-[1] md:text-8xl" />
              <Link href={startHref} className="sw-btn sw-btn-light self-start md:self-auto">
                Add flight <ArrowUpRight aria-hidden />
              </Link>
            </div>
            <footer className="sw-credits flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p>Documentation tool, not legal advice.</p>
              <div className="flex gap-5">
                <Link href="/privacy" className="hover:underline">
                  Privacy
                </Link>
                <Link href="/terms" className="hover:underline">
                  Terms
                </Link>
              </div>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
