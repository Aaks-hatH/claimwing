import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="10 October 2026">
      <h2>What ClaimWing is</h2>
      <p>ClaimWing is a documentation tool. It helps you record flight and baggage facts and prepare your own claim. It is not a law firm, does not give legal advice, and does not represent you.</p>
      <h2>Estimates, not guarantees</h2>
      <p>Eligibility results are automated estimates based on the facts stored and our reading of the rules. They can be wrong. Rules change, and airlines, regulators and courts decide each case on its facts.</p>
      <h2>Data accuracy</h2>
      <p>Flight positions come from volunteer receiver networks and may be incomplete. Schedule data comes from third parties. Check important times against your own records before you rely on them.</p>
      <h2>Your responsibilities</h2>
      <ul>
        <li>Only upload photos and documents you have the right to share.</li>
        <li>Make sure what you send to an airline is accurate. Fill in every [placeholder] in your letter.</li>
        <li>Don&apos;t send packets marked &ldquo;Demo replay&rdquo; to an airline.</li>
      </ul>
      <h2>Third-party data</h2>
      <p>Live flight data from airplanes.live and the OpenSky Network is provided for non-commercial use under their terms. Map data © OpenStreetMap contributors.</p>
      <h2>Availability</h2>
      <p>The service is provided as is. Keep your own copy of anything important by exporting your evidence packet.</p>
      <h2>Operator</h2>
      <p>[OPERATOR LEGAL NAME, ADDRESS AND GOVERNING LAW]</p>
    </LegalPage>
  );
}
