import "server-only";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { auth } from "./auth";
import { connectDB } from "./db";
import { User } from "@/models";

export type CurrentUser = {
  id: string;
  oid: Types.ObjectId;
  name: string;
  email: string;
  image?: string | null;
  preferences: {
    units: "metric" | "imperial";
    timeFormat: "24h" | "12h";
    notifyDelays: boolean;
    notifyDeadlines: boolean;
    homeCurrency: string;
    sdrRate: number;
    communityReports: boolean;
  };
  guidance: { onboardingDone: boolean; dismissedHints: string[] };
  createdAt: string;
};

/** Loads the signed-in user from the database, or null. Deleted accounts are treated as signed out. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const u = await User.findById(id).lean();
  if (!u) return null;
  return {
    id,
    oid: u._id,
    name: u.name,
    email: u.email,
    image: u.image,
    preferences: {
      units: (u.preferences?.units as "metric" | "imperial") ?? "metric",
      timeFormat: (u.preferences?.timeFormat as "24h" | "12h") ?? "24h",
      notifyDelays: u.preferences?.notifyDelays ?? true,
      notifyDeadlines: u.preferences?.notifyDeadlines ?? true,
      homeCurrency: u.preferences?.homeCurrency ?? "USD",
      sdrRate: u.preferences?.sdrRate ?? 1.36,
      communityReports: u.preferences?.communityReports ?? true,
    },
    guidance: {
      onboardingDone: Boolean(u.guidance?.onboardingCompletedAt || u.guidance?.onboardingSkippedAt),
      dismissedHints: u.guidance?.dismissedHints ?? [],
    },
    createdAt: new Date(u.createdAt).toISOString(),
  };
}

export function sdrOf(user: CurrentUser) {
  return { rate: user.preferences.sdrRate, currency: user.preferences.homeCurrency };
}

/** For pages: redirects to /login when signed out. */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
