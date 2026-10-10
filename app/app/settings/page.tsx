import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { PageHeader } from "@/components/ui/feedback";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Your profile, preferences and data." />
      <SettingsForm user={{ name: user.name, email: user.email, preferences: user.preferences }} />
    </div>
  );
}
