import "server-only";
import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { connectDB } from "./db";
import { User } from "@/models";
import { rateLimit } from "./ratelimit";

class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

let _dummy: string | null = null;
const dummyHash = () => (_dummy ??= bcrypt.hashSync("not-a-real-password", 12));

const credentialsSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const email = parsed.data.email.toLowerCase();
      const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const limit = await rateLimit("login", `${email}|${ip}`, 8, 15 * 60);
      if (!limit.ok) throw new TooManyAttempts();
      await connectDB();
      const user = await User.findOne({ email }).select("+passwordHash").lean();
      if (!user?.passwordHash) {
        // Spend comparable time when the account does not exist.
        await bcrypt.compare(parsed.data.password, dummyHash());
        return null;
      }
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return null;
      return { id: user._id.toString(), name: user.name, email: user.email, image: user.image ?? null };
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile }) {
      // Runs at sign-in: make sure there is a ClaimWing user and keep its id in the token.
      if (account?.provider === "google") {
        await connectDB();
        const email = (profile?.email ?? user?.email ?? "").toLowerCase();
        if (!email || profile?.email_verified === false) throw new Error("Google account email is not verified");
        const doc = await User.findOneAndUpdate(
          { email },
          {
            $setOnInsert: { email, provider: "google", name: profile?.name ?? user?.name ?? email.split("@")[0] },
            $set: { image: (profile as { picture?: string } | undefined)?.picture ?? user?.image ?? undefined },
          },
          { upsert: true, returnDocument: "after" },
        );
        token.uid = doc._id.toString();
        token.name = doc.name;
      } else if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
  },
});
