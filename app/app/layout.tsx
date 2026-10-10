import { AppShell } from "@/components/shell/app-shell";
import { requirePageUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return <AppShell user={{ name: user.name, email: user.email, image: user.image }}>{children}</AppShell>;
}
