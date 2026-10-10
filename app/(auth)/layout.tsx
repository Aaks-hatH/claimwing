import Link from "next/link";
import { Logo } from "@/components/brand";
import { Plane, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page flex min-h-dvh flex-col">
      <header className="auth-header">
        <Logo />
      </header>
      <main className="auth-grid">
        <aside className="auth-aside">
          <div>
            <p className="auth-aside-kicker"><ShieldCheck size={14} aria-hidden /> YOUR TRIP, ON THE RECORD</p>
            <h1 className="auth-aside-copy">Travel plans change. <em>Your record shouldn’t.</em></h1>
            <p className="auth-aside-description">Keep the flight timeline, booking details and bag evidence together—so you can show what happened, in your own words.</p>
          </div>
          <div className="auth-aside-route">
            <span className="auth-aside-route-mark"><Plane size={18} aria-hidden /></span>
            <span><strong className="block">One trip. One clear timeline.</strong><span>From departure to your evidence packet.</span></span>
          </div>
        </aside>
        <div className="auth-content">{children}</div>
      </main>
      <footer className="auth-footer">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </footer>
    </div>
  );
}
