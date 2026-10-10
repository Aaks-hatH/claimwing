import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const contact = env.contactEmail();
  return (
    <LegalPage title="Privacy notice" updated="10 October 2026">
      <h2>What we store</h2>
      <ul>
        <li>Account: your name, email, a bcrypt hash of your password (or your Google profile name, email and picture if you use Google sign-in), and your preferences.</li>
        <li>Trips: flight numbers, dates, airports, scheduled times, passenger name, booking reference and ticket price you enter.</li>
        <li>Flight evidence: aircraft position reports and schedule times collected for your flight, and times and notes you enter.</li>
        <li>Baggage: photos (stored exactly as uploaded, including any location data inside them), a resized viewing copy, the time each was taken, the location if you turned on &ldquo;Save location&rdquo;, receipts, and damage markers.</li>
        <li>Claims: letters, statuses and amounts you record.</li>
      </ul>
      <h2>Why</h2>
      <p>Only to provide the service you asked for: tracking your flights, keeping your evidence, estimating eligibility and building your evidence packet. We don&apos;t sell data, show ads, or contact airlines on your behalf.</p>
      <h2>Services we use</h2>
      <ul>
        <li>Database and file storage: MongoDB (where your account and files are kept).</li>
        <li>Flight data: airplanes.live, OpenSky Network and, if configured, a flight schedule provider. We send them flight numbers and aircraft identifiers, never your name.</li>
        <li>Weather: Open-Meteo, which receives airport coordinates and times.</li>
        <li>Optional AI features: if enabled and you use them, before/after photos or your letter text are sent to Anthropic to generate suggestions.</li>
        <li>Sign-in with Google, if you choose it.</li>
      </ul>
      <h2>Your choices</h2>
      <p>You can export all your data or permanently delete your account, photos and receipts from Settings at any time. Deleting a trip deletes its photos and evidence.</p>
      <h2>Security</h2>
      <p>Every request is checked so you can only access your own records. Files are served only to their owner. Passwords are hashed. Sign-in attempts are rate-limited.</p>
      <h2>Contact</h2>
      <p>{contact ? <>Email {contact}.</> : "[OPERATOR CONTACT DETAILS]"}</p>
    </LegalPage>
  );
}
