import { AppShell } from "@/components/shell/app-shell";
import { GuidanceProvider } from "@/components/help/guidance";
import { requirePageUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <GuidanceProvider initial={{ signedIn: true, onboardingDone: user.guidance.onboardingDone, dismissedHints: user.guidance.dismissedHints }}>
      <AppShell user={{ name: user.name, email: user.email, image: user.image }}>{children}</AppShell>
    </GuidanceProvider>
  );
}
